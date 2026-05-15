# Context + State Management Reference

---

## `JourneyContext`

**File**: `contexts/JourneyContext.tsx`

The central orchestrator for journey lifecycle. Bridges Redux (persistence/sharing) with real-time GPS via `useSmartTracking`, manages foreground/background transitions, handles iOS Live Activities and Android foreground service notifications, and coordinates group journey WebSocket state.

Mount once at the app root. Access via `useJourney()`.

```ts
import { useJourney } from '../contexts/JourneyContext';
```

### Provider

```tsx
<JourneyProvider>
  {children}
</JourneyProvider>
```

Internally mounts:
- `useSmartTracking(journeyState.isTracking, activeVehicle)` — GPS subscription
- `BackgroundLocationDisclosureModal` — shown before background permission request
- `BatteryOptimizationModal` — shown on Android when battery optimisation is active

### Full API Table

| Value / Function | Type | Description |
|---|---|---|
| `currentJourney` | `JourneyData \| null` | The active or most-recent journey document |
| `isTracking` | `boolean` | Whether GPS subscription is active |
| `isMinimized` | `boolean` | Whether the journey HUD is in minimized mode |
| `stats` | `JourneyStats` | Derived live stats (see below) |
| `routePoints` | `RoutePoint[]` | Ordered route coordinates from Redux |
| `groupMembers` | `GroupMember[]` | Members in the active group journey |
| `uploadQueue` | `UploadJob[]` | Photo upload jobs and their statuses |
| `hydrated` | `boolean` | True once Redux journey slice has been rehydrated |
| `currentLocation` | `LocationPoint \| null` | Latest smoothed GPS fix from `useSmartTracking` |
| `startJourney(journeyData)` | `(data: Partial<JourneyData>) => Promise<boolean>` | Creates journey on backend, shows disclosure modal if needed, starts GPS |
| `saveJourney(journeyData)` | `(data: Partial<JourneyData> & { startTime?, notes? }) => Promise<boolean>` | Persists journey edits to backend |
| `pauseJourney()` | `() => Promise<void>` | Snapshots distance/time into pre-resume refs, stops GPS subscription and background task |
| `resumeJourney()` | `() => Promise<void>` | Restarts GPS, restores pre-pause totals via refs |
| `endJourney()` | `() => Promise<string \| null>` | Finalises journey on backend, stops all tracking, returns journey ID |
| `clearStuckJourney()` | `() => Promise<void>` | Emergency cleanup for journeys stuck in active state (e.g. after crash) |
| `addPhoto(photoUri)` | `(uri: string) => Promise<void>` | Uploads a photo and attaches it to the current journey |
| `minimizeJourney()` | `() => void` | Dispatches `setJourneyMinimized(true)` |
| `maximizeJourney()` | `() => void` | Dispatches `setJourneyMinimized(false)` |
| `loadGroupMembers(groupId)` | `(id: string) => Promise<void>` | Fetches group member list from backend |
| `updateMemberLocation(memberId, location)` | `(id: string, loc: LocationPoint) => void` | Dispatches a member location update to Redux |
| `resumeActiveJourney(journeyId)` | `(id: string) => Promise<boolean>` | Recovers an in-progress journey after app restart |

### `JourneyStats` Shape

```ts
interface JourneyStats {
  totalDistance: number;  // km (pre-pause + current segment)
  totalTime: number;      // seconds (wall clock from startTime)
  movingTime: number;     // seconds (moving only, from useSmartTracking)
  avgSpeed: number;       // km/h (totalDistance / totalMovingTime * 3600)
  topSpeed: number;       // km/h (from useSmartTracking)
  currentSpeed: number;   // km/h (liveRawLocation.speed * 3.6)
}
```

Stats are derived in `derivedStats` (memoised):
- **While tracking**: `preResumeDistanceRef + officialDistance` / `preResumeMovingTimeRef + movingTime`
- **While paused**: reads last-dispatched Redux values (useSmartTracking resets to 0 on pause)

### Pause / Resume State Refs

| Ref | Type | Purpose |
|---|---|---|
| `preResumeDistanceRef` | `Ref<number>` | Distance accumulated across all completed segments (km) |
| `preResumeMovingTimeRef` | `Ref<number>` | Moving time accumulated across all completed segments (s) |
| `routePointsBaselineRef` | `Ref<RoutePoint[]>` | Route points from all completed segments; prepended on resume to preserve polyline continuity |

### Battery Optimisation Check

On Android, `checkAndShowBatteryOptimization()` is called at journey start. It:
1. Checks `battery_opt_asked_at` AsyncStorage key — skips if asked within 7 days.
2. Calls `notifee.isBatteryOptimizationEnabled()`.
3. If still restricted: writes timestamp, then shows `BatteryOptimizationModal` after a 1.2 s delay (lets the journey screen settle first).

### Background / Foreground Transitions

`JourneyContext` subscribes to `AppState` changes. On foreground restore while tracking:
1. Calls `getPersistedJourneyState()` to read background-accumulated stats.
2. Merges background distance/time into `preResumeDistanceRef` / `preResumeMovingTimeRef`.
3. Calls `getBufferedBackgroundPoints()` to retrieve raw GPS points collected while backgrounded.
4. These points are loaded into `bgMergedRoutePointsRef` and included in the next route dispatch (between baseline and new snapped points).

---

## `AuthContext`

**File**: `contexts/AuthContext.tsx`

Manages Firebase Auth session, Wayfarian backend user sync, token refresh scheduling, and onboarding/profile-setup flags.

Access via `useAuth()`.

```ts
import { useAuth } from '../contexts/AuthContext';
```

### API

| Value / Function | Type | Description |
|---|---|---|
| `user` | `User \| null` | Wayfarian backend user profile |
| `firebaseUser` | `FirebaseUser \| null` | Raw Firebase Auth user |
| `loading` | `boolean` | True during async auth operations |
| `isInitializing` | `boolean` | True while Firebase session restore and AsyncStorage reads are in-flight |
| `isAuthenticated` | `boolean` | Optimistically set true before backend sync completes |
| `hasCompletedOnboarding` | `boolean` | Persisted in AsyncStorage (`@wayfarian:onboarding_completed`) |
| `hasCompletedProfileSetup` | `boolean` | Persisted in AsyncStorage (`@wayfarian:profile_setup_completed`) |
| `isNewSignUp` | `boolean` | True only for the session immediately after a new account is created |
| `login(email, password)` | `Promise<void>` | Sign in with email/password |
| `register(email, password, displayName)` | `Promise<void>` | Create new account |
| `loginWithGoogle()` | `Promise<void>` | Google OAuth (web popup / expo-auth-session / native SDK, runtime-selected) |
| `loginWithApple()` | `Promise<void>` | Apple Sign-In (iOS only; SHA-256 HEX nonce) |
| `logout()` | `Promise<void>` | Signs out from Firebase, Google, and backend; clears all local state |
| `deleteAccount()` | `Promise<void>` | Deletes backend data then Firebase account; clears all cached state |
| `refreshUser(updatedUser?)` | `Promise<void>` | Merges a partial update locally (no round-trip) or does a full backend sync |
| `completeOnboarding()` | `Promise<void>` | Writes `@wayfarian:onboarding_completed = 'true'` |
| `completeProfileSetup()` | `Promise<void>` | Writes `@wayfarian:profile_setup_completed = 'true'` |
| `resetPassword(email)` | `Promise<void>` | Sends Firebase password-reset email (silently succeeds for unknown emails) |

### Cold-Start Auth Sequence

1. MMKV is read synchronously on first render to seed `isAuthenticated` and `hasCompletedOnboarding` — prevents onboarding flash before async Firebase restore.
2. `initializeAuthState` effect loads `USER_DATA_KEY`, `ONBOARDING_KEY`, `PROFILE_SETUP_KEY` from AsyncStorage and restores cached user session.
3. Firebase `onAuthStateChanged` fires — if a user is returned, `syncUserData()` is called; if null fires before cached user loads, a three-way guard (`currentUserRef`, `wasAuthenticatedRef`, `firstAuthResolvedRef`) prevents wiping a valid session.
4. Token refresh is scheduled 2 minutes before JWT expiry via `onIdTokenChanged`.

### `User` Shape

```ts
interface User {
  id: string;
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  photoURL?: string;
  country?: string;
  countryCode?: string;
  totalDistance: number;
  totalTime: number;
  topSpeed: number;
  totalTrips: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## `SettingsContext`

**File**: `contexts/SettingsContext.tsx`

Persists user preferences via MMKV / AsyncStorage. Provides unit conversion helpers.

Access via `useSettings()`.

```ts
import { useSettings } from '../contexts/SettingsContext';
```

### API

| Value / Function | Type | Description |
|---|---|---|
| `notificationsEnabled` | `boolean` | Whether push notifications are enabled |
| `units` | `'km' \| 'mi'` | Distance and speed unit preference |
| `mapType` | `'standard' \| 'satellite' \| 'terrain'` | Active map tile layer |
| `vehicle` | `'car' \| 'bike' \| 'scooter'` | Default vehicle type |
| `setNotificationsEnabled(val)` | `Promise<void>` | Persists flag and registers/unregisters push token |
| `setUnits(val)` | `Promise<void>` | Persists to `settings.units` key |
| `setMapType(val)` | `Promise<void>` | Persists to `settings.mapType` key |
| `setVehicle(val)` | `Promise<void>` | Persists to `settings.vehicle` key |
| `convertDistance(km)` | `(km: number) => string` | Returns `"12.3 km"` or `"7.6 mi"` based on `units` |
| `convertSpeed(kmh)` | `(kmh: number) => string` | Returns `"50 km/h"` or `"31 mph"` based on `units` |

On mount, performs a one-time migration from AsyncStorage to MMKV if MMKV is available. Push token registration runs on cold start if notifications are enabled.

---

## `AlertContext`

**File**: `contexts/AlertContext.tsx`

Provides a global `LiquidAlert` (animated in-app alert) accessible from any component without prop-drilling. API details are specific to the alert component implementation.

---

## Redux Store

**File**: `store/index.ts`

Configured with Redux Toolkit + redux-persist backed by AsyncStorage.

### Slices

| Slice | Key | Persisted | Description |
|---|---|---|---|
| `auth` | `auth` | Yes (root) | Auth token, minimal user shape, loading/error flags |
| `journey` | `journey` | Yes (own config) | Journey, group, route points, stats, upload queue |
| `ui` | `ui` | Yes (root) | Theme, map type, notification prefs, modal state |
| `group` | `group` | No (blacklisted) | Ephemeral group list / membership data |
| `vehicles` | `vehicles` | No | Vehicle list for the current user |

### `authSlice` Actions

| Action | Payload | Description |
|---|---|---|
| `setUser` | `User` | Sets user, marks `isAuthenticated: true` |
| `setToken` | `string` | Stores raw auth token |
| `logout` | — | Clears all auth state |
| `setLoading` | `boolean` | Toggles loading flag |
| `setError` | `string` | Records auth error, clears loading |
| `clearError` | — | Dismisses auth error |
| `updateUserStats` | `{ totalDistance?, totalJourneys? }` | Patches lifetime stats without re-fetch |

### `journeySlice` — Key Fields

```ts
interface JourneyState {
  groupJourney: GroupJourney | null;
  currentJourney: JourneyData | null;
  myInstance: JourneyInstance | null;
  memberInstances: Record<string, JourneyInstance>;
  memberLocations: Record<string, LocationUpdate>;
  groupMembers: Record<string, GroupMember>;
  events: RideEvent[];
  status: 'idle' | 'loading' | 'active' | 'error';
  error: string | null;
  stats: {
    activeMembersCount: number;
    completedMembersCount: number;
    totalDistance: number;
    totalTime: number;
    movingTime: number;
    avgSpeed: number;
    topSpeed: number;
    currentSpeed: number;
  };
  hydrated: boolean;
  isTracking: boolean;      // NOT persisted (see store/index.ts comment)
  isMinimized: boolean;
  routePoints: RoutePoint[]; // capped at 2000
  uploadQueue: UploadJob[];
  groupTracking: { isTracking: boolean; instanceId: string | null };
}
```

### `uiSlice` — Key Fields

```ts
interface UIState {
  theme: 'light' | 'dark' | 'auto';
  mapType: 'standard' | 'satellite' | 'hybrid';
  isOnboarding: boolean;
  notifications: { enabled: boolean; sound: boolean; vibration: boolean };
  preferences: {
    distanceUnit: 'km' | 'mi';
    speedUnit: 'kph' | 'mph';
    showMemberMarkers: boolean;
    autoStartTracking: boolean;
  };
  modal: { visible: boolean; type: string | null; data: any };
}
```

### Typed Hooks

Use these everywhere instead of the plain Redux hooks for full type inference:

```ts
import { useAppDispatch, useAppSelector } from '../store/hooks';

const dispatch = useAppDispatch();
const value = useAppSelector(state => state.journey.isTracking);
```
