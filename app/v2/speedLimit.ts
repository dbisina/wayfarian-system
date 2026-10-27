// app/v2/speedLimit.ts
// Decides when the live-ride screen should ask the server for the posted speed limit, and what to
// show. Pure so it can be tested; the hook in useSpeedLimit.ts does the asking.

import { haversineM } from './mapCamera';

export interface SpeedLimitState {
  /** Where the last lookup was made, and when (epoch ms). */
  at: { latitude: number; longitude: number } | null;
  t: number;
}

/** A new lookup is due after moving this far, or after this long, whichever comes first. */
export const REFETCH_M = 150;
export const REFETCH_MS = 20_000;
/** A lookup that found nothing is retried later than a hit: the road probably has no tag. */
export const MIN_GAP_MS = 4_000;

export function shouldLookUp(state: SpeedLimitState, here: { latitude: number; longitude: number }, now: number): boolean {
  if (!state.at) return true;
  const since = now - state.t;
  if (since < MIN_GAP_MS) return false;
  return since >= REFETCH_MS || haversineM(state.at, here) >= REFETCH_M;
}

/** The limit to show: the route's, when navigating and it has one, otherwise what the lookup found. */
export function pickDisplayLimit(routeKmh: number | null | undefined, lookupKmh: number | null | undefined): number | null {
  if (routeKmh != null && routeKmh > 0) return routeKmh;
  if (lookupKmh != null && lookupKmh > 0) return lookupKmh;
  return null;
}

/** The number printed on the sign, in the rider's unit (miles per hour rounds to 5, as signs do). */
export function signValue(kmh: number, units: 'km' | 'mi'): number {
  if (units === 'km') return Math.round(kmh);
  return Math.round((kmh * 0.621371) / 5) * 5;
}
