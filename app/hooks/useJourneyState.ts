import { useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import type { RootState } from '../store';

/** @returns The full journey Redux slice. Prefer the narrower selectors below for component use. */
export const selectJourneyState = (state: RootState) => state.journey;
/** @returns The active group journey record, or null when riding solo. */
export const selectGroupJourney = (state: RootState) => state.journey.groupJourney;
/** @returns The current (in-progress or most recent) journey document. */
export const selectCurrentJourney = (state: RootState) => state.journey.currentJourney;
/** @returns Map of member ID → member record for the active group journey. */
export const selectJourneyMembers = (state: RootState) => state.journey.groupMembers;
/** @returns Map of member ID → individual ride instance for the active group journey. */
export const selectMemberInstances = (state: RootState) => state.journey.memberInstances;
/** @returns Map of member ID → last known location for live map rendering. */
export const selectMemberLocations = (state: RootState) => state.journey.memberLocations;
/** @returns Aggregated journey stats (distance, speed, time). */
export const selectJourneyStats = (state: RootState) => state.journey.stats;
/** @returns Ordered list of ride events for the current journey. */
export const selectJourneyEvents = (state: RootState) => state.journey.events;
/** @returns Whether the journey slice has been rehydrated from AsyncStorage. */
export const selectJourneyHydration = (state: RootState) => state.journey.hydrated;
/** @returns Ordered array of route coordinates used by the map polyline. */
export const selectRoutePoints = (state: RootState) => state.journey.routePoints;
/** @returns Queue of location snapshots awaiting upload to the backend. */
export const selectUploadQueue = (state: RootState) => state.journey.uploadQueue;
/** @returns Whether the group is in an active group-tracking session. */
export const selectGroupTracking = (state: RootState) => state.journey.groupTracking;

/**
 * Derived selector that bundles the most commonly toggled UI flags.
 * @returns `{ status, error, isTracking, isMinimized }`
 */
export const selectJourneyStatus = (state: RootState) => ({
  status: state.journey.status,
  error: state.journey.error,
  isTracking: state.journey.isTracking,
  isMinimized: state.journey.isMinimized,
});

/** @returns The full journey Redux slice. */
export function useJourneyState() {
  return useAppSelector(selectJourneyState);
}

/** @returns Array of group members, memoised from the member map. */
export function useJourneyMembers() {
  const members = useAppSelector(selectJourneyMembers);
  return useMemo(() => Object.values(members), [members]);
}

/** @returns Array of individual ride instances, memoised from the instance map. */
export function useJourneyInstances() {
  const instances = useAppSelector(selectMemberInstances);
  return useMemo(() => Object.values(instances), [instances]);
}

/** @returns Map of member ID → last known location. */
export function useJourneyLocations() {
  const locations = useAppSelector(selectMemberLocations);
  return locations;
}

/** @returns Aggregated journey stats. */
export function useJourneyStats() {
  return useAppSelector(selectJourneyStats);
}

/** @returns Ordered list of ride events. */
export function useJourneyEvents() {
  return useAppSelector(selectJourneyEvents);
}

/** @returns True once the journey slice has been rehydrated from AsyncStorage. */
export function useJourneyHydration() {
  return useAppSelector(selectJourneyHydration);
}

/** @returns `{ status, error, isTracking, isMinimized }` — common UI control flags. */
export function useJourneyStatusFlags() {
  return useAppSelector(selectJourneyStatus);
}

/** @returns Ordered route coordinates for the map polyline. */
export function useJourneyRoutePoints() {
  return useAppSelector(selectRoutePoints);
}

/** @returns Location snapshots pending upload. */
export function useJourneyUploadQueue() {
  return useAppSelector(selectUploadQueue);
}

/** @returns Whether a group-tracking session is currently active. */
export function useGroupTracking() {
  return useAppSelector(selectGroupTracking);
}
