# Hooks API Reference

All hooks live in `hooks/`.

---

## `useSmartTracking(isTracking, vehicle)`

**File**: `hooks/useSmartTracking.ts`

Real-time journey tracking hook. Combines device GPS (Doppler speed), Google Roads API path snapping, and Haversine fallback distance into a single stream of clean stats.

### Signature

```ts
function useSmartTracking(
  isTracking: boolean,
  vehicle?: 'car' | 'bike' | 'scooter'   // default: 'car'
): {
  liveRawLocation: SmartLocation | null;
  officialSnappedPath: { latitude: number; longitude: number }[];
  officialDistance: number;   // km
  movingTime: number;         // seconds
  avgSpeed: number;           // km/h (via StatsCalculator)
  maxSpeed: number;           // km/h
}
```

### Types

```ts
interface SmartLocation {
  latitude: number;
  longitude: number;
  speed: number;    // m/s — smoothed display speed
  heading: number;
  timestamp: number;
  accuracy: number;
}
```

### Behaviour

Toggling `isTracking` from `false` → `true` **resets all accumulators** (distance, time, path, speed buffers). Toggling to `false` removes the location subscription and flushes any buffered points to the Roads API.

The GPS subscription uses `Location.watchPositionAsync` on all platforms (500 ms / 3 m intervals, `BestForNavigation` accuracy).

### Algorithm — per GPS fix

1. **Accuracy gate**: fixes with accuracy > 30 m are dropped.
2. **Raw speed**: uses device Doppler speed; falls back to position-delta when device reports ≤ 0.1 m/s.
3. **Absolute ceiling**: speed > 200 km/h (55.5 m/s) → zeroed (GPS glitch).
4. **Acceleration cap**: speed jumps > 8 m/s² are clamped to `prev + 8 * dt`.
5. **Dwell detection**: speed < 1.0 m/s for > 5 s → `isDwelling = true` → display speed decays to 0.
6. **Stationary filter**: filtered speed = 0 when rawSpeed < 0.3 m/s.
7. **Exponential smoothing**:
   - While moving: `alpha = 0.25 + speedBoost*0.6 - accuracyPenalty*0.15` (range 0.2–0.85)
   - Braking: uses fixed factor 0.5 (faster response)
   - Stopped: display speed = `prevSmoothed * 0.7` (decay), zeroed at < 0.3 m/s
8. **Position smoothing**: same adaptive alpha applied to lat/lng to suppress marker jitter.
9. **Heading**: only updated when rawSpeed > 0.8 m/s; stale heading held otherwise.
10. **Max speed**: requires `MAX_SPEED_SAMPLES_REQUIRED` (4) consecutive readings within 15% of each other, and below the per-vehicle cap. Median of those samples is used.
11. **Distance accumulation (Haversine)**: gated on `rawSpeed > 0.2 m/s`. Min move = `max(3 m, accuracy * 0.5)`. Max jump = 0.5 km (teleport guard).
12. **Moving time**: accumulated only when `filteredSpeed > 0` and not dwelling. Delta capped at 30 s to swallow app-suspension gaps.
13. **Roads API buffer**: accurate fixes (accuracy ≤ 30 m, distance from last > 2 m) are buffered. Flush triggers at 8 points or 10 s.
14. **Distance displayed**: `max(roadsApiDistance, haversineDistance)` — monotonically increasing even when Roads API corrects a segment downward.

### Constants Table

| Constant | Value | Purpose |
|---|---|---|
| `BUFFER_SIZE` | 8 | Roads API flush trigger (point count) |
| `FLUSH_INTERVAL_MS` | 10 000 ms | Roads API flush trigger (time) |
| `STATIONARY_SPEED_THRESHOLD_MPS` | 0.3 m/s | Speed below which display reads 0 |
| `DWELL_SPEED_THRESHOLD_MPS` | 1.0 m/s | Speed below which dwell timer starts |
| `DWELL_THRESHOLD_MS` | 5 000 ms | How long below dwell threshold before isDwelling |
| `MAX_REASONABLE_SPEED_MPS` | 55.5 m/s (200 km/h) | Hard ceiling; exceeded → speed zeroed |
| `MAX_ACCELERATION_MPS2` | 8.0 m/s² | Max allowed speed increase per second |
| `SPEED_SMOOTHING_FACTOR` | 0.4 | EMA alpha for acceleration |
| `SPEED_DECAY_FACTOR` | 0.7 | Decay multiplier per tick when stopped |
| `MIN_ACCURACY_FOR_TRACKING` | 30 m | Fixes less accurate than this are dropped |
| `MAX_DISTANCE_BETWEEN_POINTS_KM` | 0.5 km | Teleport guard |
| `MIN_DISTANCE_FOR_ACCUMULATION_M` | 3 m | Min haversine move to add to distance |
| `JITTER_ACCURACY_MULTIPLIER` | 0.5 | Scales min move by GPS accuracy |
| `MAX_SNAPPED_PATH_POINTS` | 2 000 | Rolling window of snapped coordinates |
| `MAX_SPEED_SAMPLES_REQUIRED` | 4 | Consecutive samples needed to set new max |

### Vehicle Speed Caps

| Vehicle | Cap (km/h) |
|---|---|
| `car` | 180 |
| `bike` | 50 |
| `scooter` | 80 |

Samples above the cap are treated as GPS glitches and reset the sustained-sample buffer.

---

## `useJourneyState()`

**File**: `hooks/useJourneyState.ts`

Returns the full `journeySlice` Redux state. Prefer the narrower selectors below for component use to avoid unnecessary re-renders.

```ts
function useJourneyState(): JourneyState
```

---

## `useJourneyStats()`

Returns aggregated journey stats from the Redux store. Updated by `JourneyContext` on every GPS fix.

```ts
function useJourneyStats(): {
  activeMembersCount: number;
  completedMembersCount: number;
  totalDistance: number;   // km
  totalTime: number;       // seconds (wall clock)
  movingTime: number;      // seconds (moving only)
  avgSpeed: number;        // km/h
  topSpeed: number;        // km/h
  currentSpeed: number;    // km/h
}
```

---

## `useJourneyRoutePoints()`

Returns the ordered array of route coordinates used by the map polyline.

```ts
function useJourneyRoutePoints(): RoutePoint[]

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
}
```

Capped at 2 000 points in Redux to prevent OOM on long rides (matches background task and Roads API caps).

---

## `useJourneyStatusFlags()`

Returns the four most-toggled UI control flags as a single memoised selector.

```ts
function useJourneyStatusFlags(): {
  status: 'idle' | 'loading' | 'active' | 'error';
  error: string | null;
  isTracking: boolean;
  isMinimized: boolean;
}
```

---

## Other `useJourneyState.ts` hooks

| Hook | Returns |
|---|---|
| `useJourneyMembers()` | `GroupMember[]` — memoised array from `groupMembers` map |
| `useJourneyInstances()` | `JourneyInstance[]` — memoised array from `memberInstances` map |
| `useJourneyLocations()` | `Record<string, LocationUpdate>` — member ID → last location |
| `useJourneyEvents()` | `RideEvent[]` — ordered ride events for current journey |
| `useJourneyHydration()` | `boolean` — true once the journey slice has been rehydrated from AsyncStorage |
| `useJourneyUploadQueue()` | `UploadJob[]` — photo upload queue |
| `useGroupTracking()` | `{ isTracking: boolean; instanceId: string \| null }` |

---

## `useRealtimeEvents(options)`

**File**: `hooks/useRealtimeEvents.ts`

Subscribes to live ride events for a group journey via WebSocket. Optionally pre-populates the list from the REST history endpoint on mount.

### Signature

```ts
function useRealtimeEvents(options: {
  groupJourneyId?: string;   // no-op when undefined
  autoLoad?: boolean;        // default: true — fetches event history on mount
}): {
  events: RideEvent[];
  loading: boolean;
  error: string | null;
  loadEvents: () => Promise<void>;
  postEvent: (payload: PostEventPayload) => Promise<void>;
}
```

### Behaviour

- On mount: connects to Socket.IO, joins `groupJourneyId` room, attaches `group-journey:event` listener, then (if `autoLoad`) fetches history via `GET /group-journey/:id/events`.
- New events prepended to `events` without re-fetching (socket broadcast is source of truth).
- `postEvent` is fire-and-forget; the socket broadcast updates the list.
- On unmount: leaves the room and removes the event listener.

### `RideEvent` type

```ts
interface RideEvent {
  id: string;
  type: 'MESSAGE' | 'PHOTO' | 'CHECKPOINT' | 'STATUS' | 'EMERGENCY' | 'CUSTOM';
  message?: string;
  latitude?: number;
  longitude?: number;
  mediaUrl?: string;
  data?: any;
  createdAt: string;
  user: { id: string; displayName: string; photoURL?: string };
}
```

---

## Other Hooks

| Hook | File | Purpose |
|---|---|---|
| `useLeaderboard` | `hooks/useLeaderboard.ts` | Fetches leaderboard data from backend |
| `useUserData` | `hooks/useUserData.ts` | Fetches and caches current user profile |
| `useGroupJourney` | `hooks/useGroupJourney.ts` | Group journey CRUD + member management |
| `useGroups` | `hooks/useGroups.ts` | Group list and membership operations |
| `useGoogleAuth` | `hooks/useGoogleAuth.ts` | Google Sign-In flow abstraction |
| `useColorScheme` | `hooks/use-color-scheme.ts` | System colour scheme detection |
| `useThemeColor` | `hooks/use-theme-color.ts` | Resolves a colour for the current theme |
