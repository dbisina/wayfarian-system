// server/constants/rideXp.js
// XP and "counts as a ride" rules for the v2 ride engine. Pure functions, no I/O.

/** Rides shorter than this are stored but not counted in totals, XP or ride counts. */
const MIN_COUNTED_DISTANCE_M = 100;

/**
 * XP for a finalized ride.
 *  - 2 XP per km
 *  - +50 for a 100 km ride
 * Achievement XP is awarded separately (Phase 2b) and is not part of this number.
 */
function rideXp(distanceM) {
  if (!(distanceM >= MIN_COUNTED_DISTANCE_M)) return 0;
  const km = distanceM / 1000;
  return Math.floor(km * 2) + (km >= 100 ? 50 : 0);
}

const countsAsRide = (distanceM) => distanceM >= MIN_COUNTED_DISTANCE_M;

module.exports = { MIN_COUNTED_DISTANCE_M, rideXp, countsAsRide };
