# Component Reference

Components live in `components/`. Screen components live in `app/`.

---

## `BatteryOptimizationModal`

**File**: `components/BatteryOptimizationModal.tsx`

Bottom-sheet prompt guiding the user to remove Android battery restrictions so the background tracking service survives screen-lock on aggressive ROMs (Samsung, Xiaomi, Huawei, etc.).

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `visible` | `boolean` | Yes | Controls sheet visibility |
| `onDismiss` | `() => void` | Yes | Called after the dismissal animation completes |

### Behaviour

- **Lazy data fetch**: calls `notifee.getPowerManagerInfo()` only when `visible` becomes true. This returns vendor-specific info including `manufacturer` and an optional `activity` (deep-link to the ROM's auto-start/power-manager screen).
- **Conditional Power Manager button**: shown only when `powerInfo.activity` is truthy. Button label is `"<Manufacturer> Power Manager"` when the manufacturer is known.
- **Auto-dismiss**: subscribes to `AppState` changes while visible. When the app returns to foreground (`'active'`), calls `notifee.isBatteryOptimizationEnabled()`. If the user has unrestricted the app in Settings, the sheet animates out and `onDismiss` is called automatically.
- **Animation**: backdrop fade (260 ms, ease-out-quad) and bottom-sheet slide (360 ms, ease-out-exp) run in parallel on show. Reverse animations (200 ms / 240 ms, ease-in-quad) run on dismiss.
- **Platform guard**: the component renders `null` on iOS (notifee battery APIs are Android-only). The parent `JourneyContext` also gates the check on `Platform.OS === 'android'`.

### Buttons

| Button | Action |
|---|---|
| "Unrestrict Battery" | `notifee.openBatteryOptimizationSettings()` |
| `"<Brand> Power Manager"` (conditional) | `notifee.openPowerManagerSettings()` |
| "Skip for now" | Triggers dismiss animation, calls `onDismiss` |

### When it appears

Shown by `JourneyContext` at journey start when:
1. `Platform.OS === 'android'`
2. `battery_opt_asked_at` AsyncStorage key is absent or > 7 days old
3. `notifee.isBatteryOptimizationEnabled()` returns `true`

A 1.2 s timeout delays the show to let the journey screen settle first.

---

## `BackgroundLocationDisclosureModal`

**File**: `components/BackgroundLocationDisclosureModal.tsx`

Pre-permission disclosure modal required by Google Play's background location policy. Must be shown and acknowledged **before** `requestBackgroundPermissionsAsync()` is called.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `visible` | `boolean` | Yes | Whether the modal is presented |
| `onAccept` | `() => void` | Yes | Called when the user taps the accept button; caller should then request background permissions |
| `onDecline` | `() => void` | Yes | Called when the user taps decline; caller must NOT request permissions |

### Behaviour

- Uses `Modal` with `animationType="fade"` and `transparent`.
- The back button / gesture (`onRequestClose`) triggers `onDecline`.
- Scrollable content area supports long disclosure text without clipping on small screens (max height 80% of screen height).
- Feature list items (`backgroundFeature1/2/3`) are loaded from i18n keys via `react-i18next`.
- Safe area insets are respected for the bottom padding.

### When it appears

Shown by `JourneyContext` in `startJourney()` when background location permission has not yet been granted. The pending journey data is held in `pendingJourneyData` state until the user accepts and permissions are granted, then journey creation proceeds.

---

## `TrackingOverlay`

**File**: `components/TrackingOverlay.tsx`

Fullscreen overlay rendered during an active journey. Displays real-time stats (speed, distance, elapsed time), pause/resume/end controls, and the camera button.

---

## `FloatingJourneyStatus`

**File**: `components/FloatingJourneyStatus.tsx`

Minimised journey HUD displayed when `isMinimized === true`. Shows a compact speed + distance readout and a tap target to maximise the journey view.

---

## `JourneyEndModal`

**File**: `components/JourneyEndModal.tsx`

Post-ride modal (formless journey flow). Prompts the user to enter a journey title and optionally add photos after the journey ends, before saving to the backend.

---

## `StaleRideRecovery`

**File**: `components/StaleRideRecovery.tsx`

Shown on app launch when a persisted journey exists in AsyncStorage but no active tracking session is running (e.g. after a crash or force-kill). Offers to resume or discard the stale journey.

---

## `NavArrowMarker`

**File**: `components/NavArrowMarker.tsx`

Animated map marker representing the user's current position and heading. Rotates smoothly to the latest heading value.

---

## `JourneyCamera`

**File**: `components/JourneyCamera.tsx`

In-journey camera UI for capturing photos. Attaches photos to the current journey via `addPhoto()` from `useJourney()`.

---

## `VehiclePicker`

**File**: `components/VehiclePicker.tsx`

Vehicle selection component used in journey creation. Options: car, bike, scooter. Selection propagates to `useSmartTracking` for per-vehicle speed capping.

---

## `BatteryOptimizationModal` — Android ROM Notes

The modal renders up to 4 steps depending on whether a Power Manager activity is detected:

1. Tap "Unrestrict Battery"
2. Scroll to Wayfarian in the system list
3. Choose "Unrestricted" and go back
4. *(conditional)* Allow auto-start in `<Brand>` Power Manager

The step 4 only appears when `notifee.getPowerManagerInfo()` returns a non-null `activity` string.

---

## UI Sub-components (`components/ui/`)

| Component | Description |
|---|---|
| `StatCard` | Single stat display card (label + value) |
| `StatsGrid` | Grid of `StatCard` instances for journey overview |
| `StartJourneyButton` | Animated button to start a new journey from the map tab |
| `PastJourneys` | Scrollable list of completed journey cards |
| `BottomNavigation` | Custom bottom tab bar |
| `LiquidAlert` | Animated in-app alert (used via `AlertContext`) |
| `JourneyCard` | Compact past-journey summary card |
| `JourneyCardMenu` | Context menu (edit/delete) for a journey card |
| `Header` | Screen header with back navigation |
| `XPProgress` | XP progress bar for gamification |
| `SpeedLimitSign` | Speed limit indicator overlay on the map |
| `LoadingButton` | Button with built-in loading spinner |
| `UserProfile` | User avatar + stats summary |
| `AchievementCard` | Achievement unlock display |
| `Achievements` | Achievement list |
| `BadgeCard` | Badge display card |
| `ChallengeCard` | Active challenge display card |
| `GroupCard` | Group summary card |
| `LeaderboardItem` | Single leaderboard row |
| `ProgressCard` | Journey progress indicator |

---

## Map Sub-components (`components/map/`)

| Component | Description |
|---|---|
| `GroupMapBehavior` | Manages group member marker updates and camera framing during group journeys |
| `MemberMarker` | Per-member map marker with avatar and live location |

---

## Modals

| Component | File | Description |
|---|---|---|
| `BatteryOptimizationModal` | `components/BatteryOptimizationModal.tsx` | Android battery unrestrict prompt (documented above) |
| `BackgroundLocationDisclosureModal` | `components/BackgroundLocationDisclosureModal.tsx` | Google Play background location disclosure (documented above) |
| `TermsAndConditionsModal` | `components/TermsAndConditionsModal.tsx` | T&C acceptance during registration |
| `JourneyEndModal` | `components/JourneyEndModal.tsx` | Post-ride title/photo entry (formless journey flow) |

---

## Screens (selected)

### `app/journey.tsx`

Active journey screen. Renders `TrackingOverlay` with live stats from `useJourney()`, pause/resume/end controls, and `JourneyCamera`. Reads `derivedStats` via context (not directly from Redux) so stats include pre-pause accumulated values.

### `app/(tabs)/map.tsx`

Map tab screen. Renders `MapView` with:
- Road-snapped polyline from `routePoints`
- Live position marker (`NavArrowMarker`) from `currentLocation`
- Group member markers (via `GroupMapBehavior` when in a group journey)
- `StartJourneyButton` when not tracking
- `FloatingJourneyStatus` when `isMinimized === true`

Camera throttled to 1 s updates; map marker animation 400 ms.
