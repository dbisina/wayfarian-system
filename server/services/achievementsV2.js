// server/services/achievementsV2.js
//
// v2 achievements and streaks. One catalogue, evaluated only from finalized ride data.
// Pure evaluators (no I/O) plus one function that persists results inside the caller's
// transaction, so awarding is atomic with finalizing and safe to repeat.

const { ACHIEVEMENT_XP, calculateLevel } = require('../constants/xpSystem');

// Rides below these gates are stored but do not count toward milestones.
const QUALIFY_MIN_DISTANCE_M = 500;
const QUALIFY_MIN_MOVING_S = 300;

// Ids match the legacy catalogue so existing badge artwork keeps working.
// Units: rides (count), distanceKm, speedKmh (top speed), movingHours.
const CATALOG = [
  { id: 'first_journey', type: 'rides', threshold: 1 },
  { id: 'ten_journeys', type: 'rides', threshold: 10 },
  { id: 'fifty_journeys', type: 'rides', threshold: 50 },
  { id: 'hundred_journeys', type: 'rides', threshold: 100 },

  { id: 'hundred_km', type: 'distanceKm', threshold: 100 },
  { id: 'five_hundred_km', type: 'distanceKm', threshold: 500 },
  { id: 'thousand_km', type: 'distanceKm', threshold: 1000 },
  { id: 'five_thousand_km', type: 'distanceKm', threshold: 5000 },
  { id: 'ten_thousand_km', type: 'distanceKm', threshold: 10000 },

  { id: 'speed_demon', type: 'speedKmh', threshold: 100 },
  { id: 'velocity_master', type: 'speedKmh', threshold: 150 },
  { id: 'apex_controller', type: 'speedKmh', threshold: 200 },
  { id: 'wind_reaper', type: 'speedKmh', threshold: 250 },

  { id: 'hour_rider', type: 'movingHours', threshold: 1 },
  { id: 'ten_hours', type: 'movingHours', threshold: 10 },
  { id: 'fifty_hours', type: 'movingHours', threshold: 50 },
  { id: 'hundred_hours', type: 'movingHours', threshold: 100 },

  { id: 'night_rider', type: 'nightRide' },
  { id: 'ace_of_friends', type: 'groupRides', threshold: 1 },
  { id: 'badge_hunter', type: 'groupRides', threshold: 10 },
  { id: 'road_captain', type: 'ledGroups', threshold: 1 },
  { id: 'convoy', type: 'convoy' },
].filter((a) => ACHIEVEMENT_XP[a.id]);

const qualifies = (r) => r.distanceM >= QUALIFY_MIN_DISTANCE_M && r.movingTimeS >= QUALIFY_MIN_MOVING_S;

/** Hour (0-23) of an instant in an IANA timezone, falling back to UTC if the zone is unknown. */
function localHour(date, timeZone) {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: timeZone || 'UTC' }).format(date);
    return parseInt(h, 10);
  } catch {
    return date.getUTCHours();
  }
}

const isNightHour = (h) => h >= 22 || h < 5;

/**
 * Which achievements the given totals have earned. `ctx.ride` is the ride that was just
 * finalized (used for the night rider check) and `ctx.groupRides` the user's finalized group rides.
 */
function evaluate({ stats, qualifyingRides, groupRides = 0, ledGroups = 0, convoySize = 0, ride }) {
  const earned = [];
  for (const a of CATALOG) {
    let ok = false;
    switch (a.type) {
      case 'rides': ok = qualifyingRides >= a.threshold; break;
      case 'distanceKm': ok = stats.distanceM / 1000 >= a.threshold; break;
      case 'speedKmh': ok = stats.topSpeedMps * 3.6 >= a.threshold; break;
      case 'movingHours': ok = stats.movingTimeS / 3600 >= a.threshold; break;
      case 'groupRides': ok = groupRides >= a.threshold; break;
      case 'ledGroups': ok = ledGroups >= a.threshold; break;
      case 'convoy': ok = convoySize >= 5; break;
      case 'nightRide':
        ok = !!ride && qualifies(ride) && isNightHour(localHour(new Date(ride.startedAt), ride.timezone));
        break;
      default: break;
    }
    if (ok) earned.push(a.id);
  }
  return earned;
}

/**
 * Persists newly earned achievements and their XP. Call inside the finalize transaction.
 * Returns the ones that were new on this call (empty on every repeat).
 */
async function awardForRide(tx, userId, ride) {
  const [stats, qualifyingRides, groupRides, have, ledGroups, convoySize] = await Promise.all([
    tx.userStats.findUnique({ where: { userId } }),
    tx.ride.count({
      where: { userId, status: 'FINALIZED', distanceM: { gte: QUALIFY_MIN_DISTANCE_M }, movingTimeS: { gte: QUALIFY_MIN_MOVING_S } },
    }),
    tx.ride.count({
      where: { userId, status: 'FINALIZED', groupRideId: { not: null }, distanceM: { gte: QUALIFY_MIN_DISTANCE_M }, movingTimeS: { gte: QUALIFY_MIN_MOVING_S } },
    }),
    tx.rideAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    tx.groupRide.count({ where: { leaderId: userId, status: 'ENDED' } }),
    ride.groupRideId ? tx.groupRideParticipant.count({ where: { groupRideId: ride.groupRideId, leftAt: null } }) : Promise.resolve(0),
  ]);
  if (!stats) return [];

  const owned = new Set(have.map((h) => h.achievementId));
  const fresh = evaluate({ stats, qualifyingRides, groupRides, ledGroups, convoySize, ride }).filter((id) => !owned.has(id));
  if (fresh.length === 0) return [];

  const awarded = [];
  let xpTotal = 0;
  for (const id of fresh) {
    const xp = ACHIEVEMENT_XP[id];
    // The unique (userId, achievementId) key makes a concurrent duplicate a no-op.
    const { count } = await tx.rideAchievement.createMany({
      data: [{ userId, achievementId: id, rideId: ride.id, xpAwarded: xp }],
      skipDuplicates: true,
    });
    if (count === 0) continue;
    await tx.xpLedger.create({ data: { userId, source: `achievement:${id}`, amount: xp } });
    xpTotal += xp;
    awarded.push({ achievementId: id, xpAwarded: xp });
  }

  if (xpTotal > 0) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
    const xp = (user?.xp || 0) + xpTotal;
    await tx.user.update({ where: { id: userId }, data: { xp, level: calculateLevel(xp) } });
  }
  return awarded;
}

/**
 * Where the rider stands against every badge: { id, value, threshold, pct, earned }. Counted badges
 * (rides, km, km/h, hours, group rides) show real progress; one-off badges are 0 or 100%.
 */
function progress({ stats, qualifyingRides, groupRides = 0, ledGroups = 0, earnedIds = [] }) {
  const earned = new Set(earnedIds);
  const valueOf = (a) => {
    switch (a.type) {
      case 'rides': return qualifyingRides;
      case 'distanceKm': return stats.distanceM / 1000;
      case 'speedKmh': return stats.topSpeedMps * 3.6;
      case 'movingHours': return stats.movingTimeS / 3600;
      case 'groupRides': return groupRides;
      case 'ledGroups': return ledGroups;
      default: return earned.has(a.id) ? 1 : 0;
    }
  };
  return CATALOG.map((a) => {
    const threshold = a.threshold || 1;
    const value = valueOf(a);
    const isEarned = earned.has(a.id) || value >= threshold;
    return { id: a.id, type: a.type, value: Math.round(value * 100) / 100, threshold, pct: isEarned ? 100 : Math.max(0, Math.min(99, Math.floor((value / threshold) * 100))), earned: isEarned };
  });
}

/**
 * Consecutive-day streak, derived from ride dates rather than stored, so it cannot drift.
 * `rides` are { startedAt, timezone }. A streak is still alive if the latest ride day is
 * today or yesterday in the rider's own timezone.
 */
function computeStreak(rides, now = new Date(), timeZone = 'UTC') {
  const dayKey = (date, tz) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(date); // YYYY-MM-DD
    } catch {
      return date.toISOString().slice(0, 10);
    }
  };
  const days = new Set(rides.map((r) => dayKey(new Date(r.startedAt), r.timezone || timeZone)));
  const toNum = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000;
  const sorted = [...days].map(toNum).sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] - sorted[i - 1] === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const today = toNum(dayKey(now, timeZone));
  const last = sorted[sorted.length - 1];
  let current = 0;
  if (last !== undefined && today - last <= 1) {
    current = 1;
    for (let i = sorted.length - 2; i >= 0 && sorted[i + 1] - sorted[i] === 1; i--) current++;
  }
  return { current, longest, lastRideDay: last !== undefined ? new Date(last * 86400000).toISOString().slice(0, 10) : null };
}

module.exports = {
  CATALOG,
  QUALIFY_MIN_DISTANCE_M,
  QUALIFY_MIN_MOVING_S,
  evaluate,
  progress,
  awardForRide,
  computeStreak,
  localHour,
};
