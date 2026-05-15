# Services Layer Reference

All services live in `services/`.

---

## `backgroundTaskService`

**File**: `services/backgroundTaskService.ts`

Manages the Expo background location task (`WAYFARIAN_BACKGROUND_LOCATION`) and the dual HOT/COLD AsyncStorage persistence strategy. See `ARCHITECTURE.md` for the full HOT/COLD rationale.

### Exported Functions

---

#### `startBackgroundTracking(journeyId, options?): Promise<boolean>`

Starts the Expo background location task and initialises both HOT and COLD AsyncStorage state.

**Parameters**

| Param | Type | Description |
|---|---|---|
| `journeyId` | `string` | Server-assigned journey ID |
| `options.startLocationName` | `string?` | Human-readable start location |
| `options.destinationName` | `string?` | Human-readable destination |
| `options.destinationLatitude` | `number?` | Destination lat |
| `options.destinationLongitude` | `number?` | Destination lng |
| `options.estimatedTotalDistance` | `number?` | Expected total distance in km (for progress %) |
| `options.startTime` | `number?` | Unix ms timestamp (synced with foreground) |
| `options.initialLocation` | `{ latitude, longitude, timestamp }?` | Seed location; fetched if omitted |
| `options.vehicle` | `'car' \| 'bike' \| 'scooter'?` | Determines per-vehicle speed cap |

**Returns**: `true` on success. `false` if background permission is not granted or setup throws.

**Side effects**:
- Writes HOT and COLD state to AsyncStorage.
- Calls `LiveNotificationService.initializeChannel()` before `Location.startLocationUpdatesAsync` (Android channel race prevention).
- Posts initial journey notification.
- Background task runs at 5 s / 10 m intervals with `BestForNavigation` accuracy.

---

#### `stopBackgroundTracking(): Promise<PersistedJourneyState | null>`

Stops background location tracking and clears persisted state.

**Returns**: The final merged `PersistedJourneyState` captured before storage is cleared, or `null` if nothing was persisted.

**Important**: HOT state is cleared first so any in-flight background task invocation finds null and exits without re-posting the notification. This was the root cause of the "notification persists after journey ends" bug.

**Side effects**: Stops `Location.startLocationUpdatesAsync`, calls `LiveNotificationService.dismissNotification()`, cancels the expo-notifications fallback notification.

---

#### `isBackgroundTrackingActive(): Promise<boolean>`

Returns whether the background location task is currently registered and running.

---

#### `getPersistedJourneyState(): Promise<PersistedJourneyState | null>`

Reads both HOT and COLD state and returns a merged `PersistedJourneyState`. Pending route points from HOT state are appended after the flushed COLD history so callers always see a complete, up-to-date route.

Returns `null` if no journey is persisted (HOT key is absent).

---

#### `recoverJourneyState(): Promise<PersistedJourneyState | null>`

Alias for `getPersistedJourneyState()` with no side effects. Previously wiped storage when the background task was not running — this was removed because pause/resume stops the background task while keeping state alive.

---

#### `getBufferedBackgroundPoints(): Promise<RoutePoint[]>`

Returns the raw GPS points buffered since the last Roads-API snap, used by the foreground tracker to correct displayed distance after the app returns to foreground.

---

#### `clearBackgroundBuffer(): Promise<void>`

Clears the raw-points buffer in both HOT and COLD state after the foreground tracker has consumed and snapped those points to roads.

---

### `PersistedJourneyState` type

```ts
interface PersistedJourneyState {
  journeyId: string;
  startTime: number;           // Unix ms
  totalDistance: number;       // km
  movingTime: number;          // seconds
  topSpeed: number;            // km/h
  vehicle?: 'car' | 'bike' | 'scooter';
  lastLatitude: number;
  lastLongitude: number;
  lastTimestamp: number;
  lastSpeed?: number;          // m/s
  recentHighSpeeds?: number[]; // km/h — sustained-sample buffer
  routePoints: RoutePoint[];   // merged COLD + HOT pending
  rawPointsBuffer: RoutePoint[];
  startLocationName?: string;
  destinationName?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  estimatedTotalDistance?: number;
}
```

---

### Background Task Logic (internal)

On every invocation the task:
1. Reads HOT state from AsyncStorage (exits if absent — journey ended).
2. Calculates haversine distance from last known point.
3. Validates: `distanceMeters > 10 m`, `impliedSpeed ≤ 50 m/s`, `effectiveSpeed > 0.5 m/s`.
4. Accumulates `totalDistance`, `movingTime`, `topSpeed` (sustained-sample validated, vehicle-capped).
5. Appends to `pendingRoutePoints` and `pendingRawPoints` in HOT state.
6. Every 12 invocations (~60 s): flushes pending points to COLD state.
7. Writes updated HOT state to AsyncStorage.
8. Updates the foreground service notification (yields if foreground holds a fresh lease).

---

## `directions`

**File**: `services/directions.ts`

Google Directions API wrapper and polyline decoder.

### Exported Functions

---

#### `getGoogleMapsApiKey(): string | undefined`

Resolves the Google Maps API key from the first available source:
1. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` env var
2. `GOOGLE_MAPS_API_KEY` env var
3. `expoConfig.extra.googleMapsApiKey`
4. `expoConfig.ios.config.googleMapsApiKey`
5. `expoConfig.android.config.googleMaps.apiKey`

---

#### `decodePolyline(encoded: string): LatLng[]`

Decodes a Google Maps encoded polyline string (the standard variable-length encoding algorithm) into an array of `LatLng` coordinates.

**Parameters**: `encoded` — the `overview_polyline.points` string from a Directions API response.

---

#### `fetchDirections(origin, destination, options?): Promise<DirectionsResult | null>`

Fetches a route between two coordinates using the Google Directions API.

**Parameters**

| Param | Type | Description |
|---|---|---|
| `origin` | `LatLng` | Start coordinate |
| `destination` | `LatLng` | End coordinate |
| `options.mode` | `'driving' \| 'walking' \| 'bicycling' \| 'transit'?` | Default: `'driving'` |
| `options.apiKey` | `string?` | Override the resolved API key (useful for testing) |

**Returns**: `DirectionsResult` or `null` if the API returns an error or no routes are found.

```ts
interface DirectionsResult {
  coordinates: LatLng[];    // decoded overview polyline
  distanceMeters?: number;
  durationSeconds?: number;
}

type LatLng = { latitude: number; longitude: number };
```

---

## `sentry`

**File**: `services/sentry.ts`

Sentry React Native SDK wrapper. All functions no-op silently when `EXPO_PUBLIC_SENTRY_DSN` is not set.

### Exported Functions

---

#### `initSentry(): void`

Initialises the Sentry SDK. Call once at app root (before navigation mounts).

**Configuration**:
- `tracesSampleRate` / `profilesSampleRate`: 10% in production, 100% in development
- `beforeSend`: drops auth errors (invalid/expired token, cancelled), validation errors, and development network errors
- `beforeBreadcrumb`: strips `Authorization`, `password`, `token` fields from HTTP breadcrumbs; drops AsyncStorage breadcrumbs (PII risk)
- `enableNativeCrashHandling: true`, `enableAutoSessionTracking: true` (30 s intervals)
- Integrations: `reactNativeTracingIntegration` (HTTP timings), `reactNavigationIntegration` (screen tracking)
- Skips sending in development unless `EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV` is set

---

#### `captureException(error, context?): void`

Reports an `Error` to Sentry.

| Param | Type | Description |
|---|---|---|
| `error` | `Error` | The error to report |
| `context.tags` | `Record<string, string>?` | Key/value pairs for Sentry issue grouping |
| `context.extra` | `Record<string, any>?` | Arbitrary extra data |
| `context.level` | `SeverityLevel?` | Default: `'error'` |

---

#### `captureMessage(message, level?, context?): void`

Records a free-form message in Sentry. Default level: `'info'`.

---

#### `setUser(user): void`

Sets the authenticated user context on all subsequent Sentry events. Call after successful login.

```ts
setUser({ id: string; email?: string; username?: string })
```

---

#### `clearUser(): void`

Clears the user context from Sentry. Call on logout.

---

#### `addBreadcrumb(message, data?, category?, level?): void`

Adds a breadcrumb to the current session's event trail. Default category: `'custom'`, default level: `'info'`.

---

#### `ErrorBoundary`

Re-export of `Sentry.wrap` — a higher-order component that wraps a React component with a Sentry error boundary. Uncaught render errors are captured and a fallback UI is shown.

---

## Other Services

| Service | File | Purpose |
|---|---|---|
| `locationService` | `services/locationService.ts` | Lower-level location subscription and `JourneyStats` type definitions |
| `backgroundTasks` | `services/backgroundTasks.ts` | Legacy background task helpers (superseded by `backgroundTaskService`) |
| `liveNotificationService` | `services/liveNotificationService.ts` | notifee channel setup and journey progress notification updates |
| `notificationService` | `services/notificationService.ts` | Push notification token registration / unregistration |
| `groupJourneySocket` | `services/groupJourneySocket.ts` | Group journey WebSocket room lifecycle |
| `socket` | `services/socket.ts` | Socket.IO client singleton (connect, join/leave room, on/off) |
| `api` | `services/api.ts` | Authenticated HTTP client; caches Firebase ID token in memory |
| `storage` | `services/storage.ts` | MMKV / AsyncStorage abstraction with migration helper |
| `kalmanFilter` | `services/kalmanFilter.ts` | Kalman filter for GPS position smoothing (available for opt-in) |
| `roads` | `services/roads.ts` | Direct Roads API client (also used internally by `useSmartTracking`) |
| `offlineQueueService` | `services/offlineQueueService.ts` | Queues failed API requests for retry when connectivity is restored |
