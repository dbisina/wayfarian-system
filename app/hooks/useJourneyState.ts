// app/hooks/useJourneyState.ts
// Centralized selectors for the journey slice

import { useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import type { RootState } from '../store';

export const selectJourneyState = (state: RootState) => state.journey;
export const selectGroupJourney = (state: RootState) => state.journey.groupJourney;
export const selectCurrentJourney = (state: RootState) => state.journey.currentJourney;
export const selectJourneyMembers = (state: RootState) => state.journey.groupMembers;
export const selectMemberInstances = (state: RootState) => state.journey.memberInstances;
export const selectMemberLocations = (state: RootState) => state.journey.memberLocations;
export const selectJourneyStats = (state: RootState) => state.journey.stats;
export const selectJourneyEvents = (state: RootState) => state.journey.events;
export const selectJourneyHydration = (state: RootState) => state.journey.hydrated;
export const selectRoutePoints = (state: RootState) => state.journey.routePoints;
export const selectUploadQueue = (state: RootState) => state.journey.uploadQueue;
export const selectGroupTracking = (state: RootState) => state.journey.groupTracking;
export const selectJourneyStatus = (state: RootState) => ({
  status: state.journey.status,
  error: state.journey.error,
  isTracking: state.journey.isTracking,
  isMinimized: state.journey.isMinimized,
});

export function useJourneyState() {
  return useAppSelector(selectJourneyState);
}

export function useJourneyMembers() {
  const members = useAppSelector(selectJourneyMembers);
  return useMemo(() => Object.values(members), [members]);
}

export function useJourneyInstances() {
  const instances = useAppSelector(selectMemberInstances);
  return useMemo(() => Object.values(instances), [instances]);
}

export function useJourneyLocations() {
  const locations = useAppSelector(selectMemberLocations);
  return locations;
}

export function useJourneyStats() {
  return useAppSelector(selectJourneyStats);
}

export function useJourneyEvents() {
  return useAppSelector(selectJourneyEvents);
}

export function useJourneyHydration() {
  return useAppSelector(selectJourneyHydration);
}

export function useJourneyStatusFlags() {
  return useAppSelector(selectJourneyStatus);
}

export function useJourneyRoutePoints() {
  return useAppSelector(selectRoutePoints);
}

export function useJourneyUploadQueue() {
  return useAppSelector(selectUploadQueue);
}

export function useGroupTracking() {
  return useAppSelector(selectGroupTracking);
}
