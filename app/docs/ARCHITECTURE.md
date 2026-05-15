# Wayfarian — System Architecture

## System Overview

Wayfarian is a React Native / Expo cycling and journey-tracking application for Android (primary) and iOS. Users start solo or group journeys, record GPS traces with real-time stats (distance, speed, moving time), and share progress with group members via live WebSocket updates.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK), Expo Router (file-based routing) |
| Language | TypeScript |
| State | Redux Toolkit + redux-persist (AsyncStorage) |
| Auth | Firebase Auth (email/password, Google, Apple) + Wayfarian backend JWT |
| GPS | expo-location (`watchPositionAsync`, `startLocationUpdatesAsync`) |
| Path snapping | Google Roads API (`snapToRoads`) |
| Directions | Google Directions API |
| Notifications | notifee (foreground service, Android channels) + expo-notifications (fallback) |
| Real-time | Socket.IO (group journey events, member locations) |
| Storage (fast) | MMKV (synchronous reads for auth/onboarding flags) |
| Storage (async) | AsyncStorage (Redux persist, journey hot/cold state, settings) |
| Error tracking | Sentry (`@sentry/react-native`) |
| Background tasks | expo-task-manager (`WAYFARIAN_BACKGROUND_LOCATION` task) |

---

## Data Flow

```
GPS Hardware
    |
    | (expo-location watchPositionAsync — 2 Hz / 3 m foreground)
    v
useSmartTracking (hook)
    |-- accuracy filter (reject > 30 m)
    |-- speed: Doppler from chip, fallback to position-delta
    |-- acceleration cap (max 8 m/s²)
    |-- dwell detection (< 1.0 m/s for > 5 s → isStationary)
    |-- exponential smoothing (alpha 0.2–0.85, speed+accuracy adaptive)
    |-- haversine distance accumulation (gate: rawSpeed > 0.2 m/s)
    |-- Roads API buffer (flush every 8 pts or 10 s)
    |       |
    |       v
    |   Google Roads API (snapToRoads, interpolate=true)
    |       |-- snapped path → officialSnappedPath
    |       |-- segment distance → roadsApiDistance
    |       |-- displayed distance = max(roadsApiDist, haversineDist)
    |
    v
JourneyContext (provider)
    |-- preResumeDistanceRef + officialDistance = totalDistance
    |-- preResumeMovingTimeRef + movingTime = totalMovingTime
    |-- derivedStats memoised → dispatches setStats to Redux
    |-- officialSnappedPath → dispatches setRoutePoints (on path change, NOT every fix)
    |
    v
Redux Store (journeySlice)
    |-- routePoints (capped 2000 pts)
    |-- stats { totalDistance, totalTime, movingTime, avgSpeed, topSpeed, currentSpeed }
    |-- isTracking, isMinimized
    |
    v
UI Components
    |-- map.tsx: MapView polyline, live marker, speed/distance display
    |-- journey.tsx: TrackingOverlay, stats grid, pause/resume/end controls
    |-- FloatingJourneyStatus: minimized HUD
```

---

## Foreground vs Background Tracking

### Foreground (app active)

`useSmartTracking` runs inside `JourneyContext` via `Location.watchPositionAsync`:
- 2 Hz sample rate (500 ms interval), 3 m distance interval
- Accuracy: `BestForNavigation`
- Roads API buffer flushes at 8 points or every 10 s
- Stats synced to Redux on every GPS update (~1 Hz effective)
- Map camera throttled to 1 s, marker animation 400 ms

### Background (screen off / app backgrounded)

`BackgroundTaskService` registers `WAYFARIAN_BACKGROUND_LOCATION` via `expo-task-manager`:
- 5 s interval, 10 m distance interval
- Accuracy: `BestForNavigation`, `activityType: AutomotiveNavigation`
- Foreground service notification via notifee (Android API 26+ requirement)
- Stats written to AsyncStorage HOT key on every invocation
- Route arrays flushed to COLD key every 12 invocations (~60 s)
- Foreground notification lease: background task yields notification writes to foreground tracker when a lease key is fresh (< 8 s)

On foreground restoration, `JourneyContext` reads `getPersistedJourneyState()`, merges background stats into `preResumeDistanceRef`, and prepends buffered points into `routePointsBaselineRef` to maintain a continuous polyline.

---

## Pause / Resume State Preservation

When the user pauses a journey:
1. `pauseJourney()` reads the latest `officialDistance` and `movingTime` from live refs (not stale closures).
2. Values are written into `preResumeDistanceRef` and `preResumeMovingTimeRef`.
3. The current `routePoints` array is captured into `routePointsBaselineRef`.
4. `dispatch(setTracking(false))` stops `useSmartTracking`'s subscription.
5. `stopBackgroundTracking()` clears AsyncStorage HOT/COLD state.

On resume:
1. `dispatch(setTracking(true))` restarts `useSmartTracking` — it resets its internal accumulators to 0.
2. The route-sync effect detects `routePointsBaselineRef.length > 0` and prepends the baseline when the next snapped path arrives, preventing the polyline from resetting to empty.
3. Stats are computed as `preResumeDistanceRef.current + officialDistance` so displayed totals are continuous.

The start time is separately persisted to AsyncStorage (`journey_start_time` key) so elapsed wall-clock time survives app kills during an active journey.

---

## HOT vs COLD Persistence Strategy

The background task uses two AsyncStorage keys to avoid SQLite WAL bloat on multi-hour rides.

| Key | Content | Write frequency | Max size |
|---|---|---|---|
| `activeJourneyState` (HOT) | Scalar stats + pending point buffers | Every GPS fix (~5 s) | ~200 bytes |
| `activeJourneyRoutes` (COLD) | Full route arrays | Every 12 invocations (~60 s) | ~175 KB |

A naive single-key approach at 5 s intervals for a 7-hour ride would generate ~882 MB of SQLite I/O; the HOT/COLD split reduces that to < 90 MB.

`getPersistedJourneyState()` always merges both keys before returning, appending `pendingRoutePoints` from HOT after the flushed COLD history so callers see a complete, up-to-date trace.

---

## Android-Specific Concerns

### Battery Optimisation

Aggressive Android ROMs (Samsung, Xiaomi, Huawei, etc.) kill background processes to save battery. `JourneyContext` checks `notifee.isBatteryOptimizationEnabled()` on journey start and shows `BatteryOptimizationModal` if the app is still restricted. The prompt is rate-limited to once every 7 days (stored in `battery_opt_asked_at` AsyncStorage key).

### Foreground Service Notification

Android API 26+ requires a notification channel before a foreground service can attach. `startBackgroundTracking()` calls `LiveNotificationService.initializeChannel()` before `Location.startLocationUpdatesAsync()` to avoid a race where Android kills the service because no notification exists yet.

### ROM-Specific Power Manager

`BatteryOptimizationModal` reads `notifee.getPowerManagerInfo()` to detect vendor-specific power manager activities (e.g. Samsung's "Auto-start" screen). When an `activity` is returned, the modal shows an additional "Power Manager Settings" button.

### Chrome Custom Tab Warm-up

`AuthContext` calls `WebBrowser.warmUpAsync()` on Android mount so the OAuth consent sheet opens without a cold-start delay.

### Huawei / HMS Devices

Google Play Services are unavailable on Huawei HMS devices. `loginWithGoogle` catches `PLAY_SERVICES_NOT_AVAILABLE` (code 1 / `PLAY_SERVICES_NOT_AVAILABLE`) and surfaces a user-facing message directing the user to email/password login.

---

## Redux Persistence

Root persist config (`redux-persist`, AsyncStorage):
- **Persisted slices**: `auth`, `ui`
- **Journey slice**: persisted separately with its own config (`journey` key), whitelisting: `groupJourney`, `currentJourney`, `myInstance`, `memberInstances`, `memberLocations`, `groupMembers`, `stats`, `hydrated`, `isMinimized`, `routePoints`, `uploadQueue`
- `isTracking` is **not** persisted — restored by JourneyContext recovery logic to avoid stale "tracking active" state after crashes
- **Group slice**: blacklisted (ephemeral WebSocket state)
