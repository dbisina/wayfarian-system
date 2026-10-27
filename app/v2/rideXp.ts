// app/v2/rideXp.ts
// The XP a ride is worth, worked out on the phone so the live-ride screen can show it as you go.
// Mirrors server/constants/rideXp.js, which is the authority: keep the two in step (the test pins
// the same values the server's rules give).

/** Rides shorter than this are stored but earn no XP. */
export const MIN_COUNTED_DISTANCE_M = 100;

/** 2 XP per km, plus 50 for a ride of 100 km or more. */
export function rideXp(distanceM: number): number {
  if (!(distanceM >= MIN_COUNTED_DISTANCE_M)) return 0;
  const km = distanceM / 1000;
  return Math.floor(km * 2) + (km >= 100 ? 50 : 0);
}
