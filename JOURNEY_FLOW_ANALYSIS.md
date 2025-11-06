# Journey Flow Analysis & Fixes

## Issues Identified

### 1. Solo Journey "Invalid Group ID" Error ✅ FIXED

**Problem**: When starting a solo journey, the API validation was requiring `groupId` even though it was marked as optional.

**Root Cause**:
- `app/services/api.ts` was sending `groupId: undefined` or `groupId: null` in the payload
- Server validation in `server/routes/journey.js` was treating falsy values as invalid

**Solution**:
1. Updated `app/services/api.ts` to exclude `groupId` from payload if not provided
2. Updated `server/routes/journey.js` validation to use `optional({ nullable: true, checkFalsy: true })`

```typescript
// app/services/api.ts - Before
const payload: any = {
  latitude: ...,
  longitude: ...,
  groupId: journeyData.groupId, // ❌ Sends null/undefined
};

// After
const payload: any = {
  latitude: ...,
  longitude: ...,
};
if (journeyData.groupId) { // ✅ Only include if truthy
  payload.groupId = journeyData.groupId;
}
```

```javascript
// server/routes/journey.js - Before
body("groupId").optional().isString().withMessage("Invalid group ID"),

// After  
body("groupId")
  .optional({ nullable: true, checkFalsy: true })
  .isString()
  .withMessage("Invalid group ID"),
```

### 2. Minimized Journey Shows No Destination/Counter

**Problem**: When clicking on minimized journey overlay, the journey screen opens but shows no destination and stats don't update.

**Root Causes**:

#### A. Stats Not Updating When Minimized
- `JourneyContext.tsx` only updates stats when `isTracking === true`
- When journey is paused/minimized, `isTracking` is false
- Timer stops updating, so time counter appears frozen

**Current Code**:
```typescript
// app/contexts/JourneyContext.tsx
useEffect(() => {
  if (!isTracking) return; // ❌ Stops updates when paused/minimized
  
  const interval = setInterval(() => {
    const newStats = locationService.getStats();
    setStats(newStats);
  }, 1000);
  
  return () => clearInterval(interval);
}, [isTracking]);
```

**Issue**: When user minimizes journey (even if actively tracking), stats freeze.

#### B. Destination Not Persisted
- Solo journeys don't have a predefined destination
- `currentJourney.endLocation` is only set when journey ends
- Journey screen expects destination for route display

**Current Behavior**:
- Solo journey starts with no destination
- User drives (tracking breadcrumb)
- User minimizes journey
- When reopening, destination is still undefined
- No route line is displayed

#### C. Journey State Restoration Issue
- When app boots, `JourneyContext` tries to restore active journey from backend
- If backend call fails or returns no journey, minimized state is cleared
- This causes "flash" where minimized journey appears then disappears

### 3. Confusing Flow Between Solo and Group Journeys

**Current Issues**:

#### A. Play Button Behavior
- Pressing play button when already tracking tries to stop journey (confusing)
- Should show pause/resume instead

#### B. Group Journey Instance vs Solo Journey
- Group journeys use `myInstance` (from `useGroupJourney` hook)
- Solo journeys use `currentJourney` (from `JourneyContext`)
- UI has to check both, leading to complex conditionals

#### C. Minimized Overlay Shows For Both
- Solo journey minimized: Shows user's avatar only
- Group journey minimized: Should show group members
- Current implementation mixes both contexts

## Proposed Solutions

### Solution 1: Keep Stats Updating When Minimized ✅ RECOMMENDED

**Change**: Update stats regardless of `isTracking` state if there's a current journey.

```typescript
// app/contexts/JourneyContext.tsx
useEffect(() => {
  // Update stats if there's ANY active or paused journey (not just when tracking)
  if (!currentJourney) return;
  
  const interval = setInterval(() => {
    const newStats = locationService.getStats();
    const newRoutePoints = locationService.getRoutePoints();
    
    setStats(newStats);
    setRoutePoints(newRoutePoints);
  }, 1000);
  
  return () => clearInterval(interval);
}, [currentJourney]); // ✅ Depend on journey existence, not tracking state
```

**Benefits**:
- Timer keeps ticking even when paused
- Distance/speed stats update when resumed
- No "frozen counter" issue

### Solution 2: Simplify Play/Pause Button Logic ✅ RECOMMENDED

**Change**: Make button behavior context-aware.

```typescript
// app/app/journey.tsx
const handlePlayPauseButton = async () => {
  // Solo journey
  if (!gJourneyId) {
    if (!isTracking && !currentJourney) {
      // Start new solo journey
      await startJourney({ title: 'My Journey', vehicle: 'car' });
    } else if (currentJourney?.status === 'paused') {
      // Resume paused journey
      await resumeJourney();
    } else if (isTracking) {
      // Pause active journey
      await pauseJourney();
    }
    return;
  }

  // Group journey
  if (myInstance?.status === 'PAUSED') {
    await apiRequest(`/group-journey/instance/${myInstance.id}/resume`, { method: 'POST' });
    startLocationTracking(myInstance.id);
  } else if (myInstance?.status === 'ACTIVE') {
    await apiRequest(`/group-journey/instance/${myInstance.id}/pause`, { method: 'POST' });
    // Stop tracking
  } else {
    // Start new instance
    // ...
  }
};
```

### Solution 3: Unified Journey State Management ⚠️ FUTURE

**Problem**: Having two separate journey state systems (solo vs group) causes confusion.

**Proposal**: Create unified `useJourneyInstance` hook that handles both:

```typescript
interface UnifiedJourneyInstance {
  id: string;
  type: 'solo' | 'group';
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startTime: Date;
  stats: JourneyStats;
  routePoints: LocationPoint[];
  groupId?: string;
  groupJourneyId?: string;
  members?: GroupMember[];
}

export function useJourneyInstance() {
  // Single source of truth for both solo and group journeys
  // Handles all start/pause/resume/stop logic
  // Manages location tracking for both types
}
```

**Benefits**:
- Single API for journey management
- No conditional logic in UI
- Easier to test and maintain

**Complexity**: Requires refactoring both `JourneyContext` and `useGroupJourney` hook.

### Solution 4: Add Destination Support for Solo Journeys

**Option A**: Manual Destination Selection (Simple)
- Add "Set Destination" button on journey screen
- Let user pick destination from map/search
- Store in journey state
- Display route line like group journeys

**Option B**: Smart Destination Detection (Complex)
- Analyze route points to detect common end location
- If user has been stationary for X minutes, set as destination
- Works for regular commutes

**Option C**: No Destination (Current Behavior)
- Solo journeys are "free-form" exploration
- Only show breadcrumb trail (no route line)
- Display stats only (distance/time/speed)

**Recommendation**: Keep Option C for MVP, add Option A in future release.

### Solution 5: Fix Minimized Journey Restoration ✅ IMMEDIATE

**Change**: More robust journey restoration logic.

```typescript
// app/contexts/JourneyContext.tsx
useEffect(() => {
  const loadActiveJourney = async () => {
    try {
      // 1. Try to get active solo journey
      const response = await journeyAPI.getActiveJourney();
      if (response?.journey) {
        const journey = response.journey;
        setCurrentJourney({
          id: journey.id,
          title: journey.title,
          startLocation: journey.startLatitude ? {
            latitude: journey.startLatitude,
            longitude: journey.startLongitude,
            address: journey.startAddress || 'Start Location',
          } : undefined,
          status: journey.status === 'ACTIVE' ? 'active' : 'paused',
          // ... rest of journey data
        });
        
        // Resume tracking if journey is active
        if (journey.status === 'ACTIVE') {
          setIsTracking(true);
          setIsMinimized(true);
        }
        
        return; // Found solo journey, don't check group
      }

      // 2. Try to get active group journey instance
      const instanceRes = await groupJourneyAPI.getMyActiveInstance();
      const inst = instanceRes?.instance;
      
      if (inst && (inst.status === 'ACTIVE' || inst.status === 'PAUSED')) {
        setCurrentJourney({
          id: inst.id,
          title: inst.groupJourney?.title || 'Group Ride',
          groupJourneyId: inst.groupJourneyId,
          groupId: inst.groupId,
          status: inst.status === 'ACTIVE' ? 'active' : 'paused',
          // ... rest of instance data
        });
        
        setIsTracking(inst.status === 'ACTIVE');
        setIsMinimized(true);
      }
    } catch (error) {
      console.warn('Could not restore journey (app may be offline):', error);
    } finally {
      setHydrated(true);
    }
  };

  loadActiveJourney();
}, []);
```

## Implementation Priority

### Phase 1: Critical Fixes (Now) ✅
1. ✅ Fix solo journey validation (groupId optional)
2. ✅ Update Redis/Valkey services with proper connection handling
3. ⏭️ Keep stats updating when journey exists (not just when tracking)
4. ⏭️ Improve journey restoration logic with better error handling

### Phase 2: UX Improvements (Next Sprint)
5. Simplify play/pause button logic with clear visual states
6. Add visual indicator for paused journeys (pulsing icon)
7. Add "Resume Journey" prompt when opening minimized journey
8. Show last known location on map when journey is paused

### Phase 3: Feature Enhancements (Future)
9. Add destination selection for solo journeys (optional)
10. Unified journey state management hook
11. Journey templates (save common routes)
12. Auto-pause detection (when stationary for 5+ min)

## Testing Checklist

### Solo Journey Flow
- [ ] Start solo journey (no group)
  - [ ] Verify no "Invalid group ID" error
  - [ ] Verify location tracking starts
  - [ ] Verify stats update (time, distance, speed)
- [ ] Minimize journey
  - [ ] Verify minimized overlay appears on map
  - [ ] Verify stats continue updating
- [ ] Click minimized overlay
  - [ ] Verify journey screen opens
  - [ ] Verify stats are current (not frozen)
  - [ ] Verify map shows breadcrumb trail
- [ ] Pause journey
  - [ ] Verify location tracking stops
  - [ ] Verify timer continues (elapsed time)
- [ ] Resume journey
  - [ ] Verify location tracking resumes
  - [ ] Verify stats continue from where left off
- [ ] Stop journey
  - [ ] Verify journey completes
  - [ ] Verify stats saved to backend
  - [ ] Verify minimized overlay removed

### Group Journey Flow
- [ ] Join group journey
  - [ ] Verify instance created
  - [ ] Verify member locations visible
  - [ ] Verify timeline events visible
- [ ] Minimize group journey
  - [ ] Verify group members visible in overlay
  - [ ] Verify can see other members' locations
- [ ] Reopen group journey screen
  - [ ] Verify destination shown (if set)
  - [ ] Verify route line shown
  - [ ] Verify member markers updated
- [ ] Pause/resume group journey
  - [ ] Verify status syncs with backend
  - [ ] Verify location sharing stops/starts
- [ ] Complete group journey
  - [ ] Verify instance marked complete
  - [ ] Verify stats recorded
  - [ ] Verify can view journey summary

### Edge Cases
- [ ] App backgrounded during active journey
  - [ ] Verify tracking continues (iOS: foreground only in Expo Go)
  - [ ] Verify stats don't reset on app resume
- [ ] Network loss during journey
  - [ ] Verify journey continues tracking offline
  - [ ] Verify sync when network restored
- [ ] Force quit app during journey
  - [ ] Verify journey restored on next app open
  - [ ] Verify can continue from last point
- [ ] Multiple minimized journeys (shouldn't happen)
  - [ ] Verify only one journey can be active
  - [ ] Verify starting new journey stops previous

## Current Status

✅ **Completed**:
- Solo journey validation fix
- Valkey/Redis service updates
- Documentation created

⏭️ **Next**:
- Implement stats update fix (Solution 1)
- Improve journey restoration (Solution 5)
- Add play/pause button improvements (Solution 2)

🔮 **Future**:
- Unified journey management
- Destination support for solo journeys
- Journey templates
