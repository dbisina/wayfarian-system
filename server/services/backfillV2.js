// server/services/backfillV2.js
//
// Phase 3: rebuild every user's history in the v2 tables from the legacy Journey and
// JourneyInstance rows. Legacy tables are only read. A ride with a usable GPS trail is
// recomputed with ride-core (so inflated or drifting v1 totals get corrected); a ride without
// one keeps its stored totals, flagged isLegacy. Each ride then goes through the normal
// RideService.finalize, in start order, so totals, XP, achievements and streaks come out
// exactly as if the rider had used v2 from day one.
//
// Safe to re-run: ride ids are derived from the legacy ids and finalized rides are skipped.

const defaultCore = require('@wayfarian/ride-core');
const { countsAsRide, rideXp } = require('../constants/rideXp');

const MIN_TRAIL_POINTS = 5; // fewer usable fixes than this and the trail cannot be trusted
const MAX_LEGACY_TOP_KMH = 250;
const MAX_LEGACY_AVG_MPS = 70; // same ceiling ride-core applies
const BIG_CHANGE_PCT = 20; // flag users whose distance moves by more than this
const POINT_BATCH = 1000;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Legacy routePoints come as {lat,lng,timestamp} (solo) or {latitude,longitude,timestamp} (group). */
function normalizePoints(raw, core = defaultCore) {
  if (!Array.isArray(raw)) return { points: [], dropped: 0 };
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const lat = num(p.lat ?? p.latitude);
    const lng = num(p.lng ?? p.longitude ?? p.lon);
    const t = Date.parse(p.timestamp ?? p.t ?? p.time);
    if (lat == null || lng == null || !Number.isFinite(t) || !core.isValidCoordinate(lat, lng)) continue;
    out.push({ lat, lng, t, accuracy: num(p.accuracy) });
  }
  out.sort((a, b) => a.t - b.t);
  const points = out.filter((p, i) => i === 0 || p.t !== out[i - 1].t); // same-instant duplicates
  return { points, dropped: raw.length - points.length };
}

/** Totals the legacy row claims, in v2 units (metres, seconds, m/s). */
function legacyTotals(row) {
  const distanceM = Math.max(0, (row.totalDistance || 0) * 1000);
  const timeS = Math.max(0, Math.round(row.totalTime || 0));
  const avgSpeedMps = timeS > 0 ? distanceM / timeS : 0;
  const topKmhMps = Math.min(Math.max(row.topSpeed || 0, 0), MAX_LEGACY_TOP_KMH) / 3.6;
  return {
    distanceM,
    movingTimeS: timeS,
    elapsedTimeS: timeS,
    topSpeedMps: Math.max(topKmhMps, avgSpeedMps), // the top speed can never be below the average
    avgSpeedMps,
  };
}

/**
 * Decides what one legacy row becomes. mode:
 *  recomputed  usable GPS trail, stats come from ride-core
 *  legacy      no usable trail, stored totals kept (flagged isLegacy)
 *  skipped     stored totals are physically impossible and there is no trail to correct them
 */
function planRide(kind, row, core = defaultCore) {
  const { points } = normalizePoints(row.routePoints, core);
  const legacy = legacyTotals(row);
  const base = {
    kind,
    legacyId: row.id,
    rideId: `${kind === 'instance' ? 'li' : 'lj'}_${row.id}`,
    userId: row.userId,
    startedAt: row.startTime,
    endedAt: row.endTime || null,
    vehicleId: row.vehicleId || null,
    title: row.customTitle || row.title || null,
    groupJourney: kind === 'instance' ? row.groupJourney : null,
    legacy,
  };

  if (points.length >= MIN_TRAIL_POINTS && points[points.length - 1].t > points[0].t) {
    const s = core.computeRideStats([points]);
    return {
      ...base,
      mode: 'recomputed',
      points,
      stats: {
        distanceM: s.distanceM,
        movingTimeS: Math.round(s.movingTimeS),
        elapsedTimeS: Math.round(s.elapsedTimeS),
        topSpeedMps: s.topSpeedMps,
        avgSpeedMps: s.avgSpeedMps,
      },
    };
  }

  if (legacy.elapsedTimeS > 0 && legacy.distanceM / legacy.elapsedTimeS > MAX_LEGACY_AVG_MPS) {
    return { ...base, mode: 'skipped', reason: 'implausible_speed', points: [], stats: null };
  }
  return { ...base, mode: 'legacy', points: [], stats: legacy };
}

const pct = (from, to) => (from > 0 ? ((to - from) / from) * 100 : to > 0 ? 100 : 0);

/** Old (v1 user columns) vs new (what the plan would credit). XP excludes achievement XP. */
function summarizeUser(user, plans, skipped) {
  const counted = plans.filter((p) => p.stats && countsAsRide(p.stats.distanceM));
  const oldS = { distanceKm: user.totalDistance || 0, movingTimeS: user.totalTime || 0, topSpeedKmh: user.topSpeed || 0, rides: user.totalTrips || 0, xp: user.xp || 0 };
  const newS = {
    distanceKm: counted.reduce((s, p) => s + p.stats.distanceM, 0) / 1000,
    movingTimeS: counted.reduce((s, p) => s + p.stats.movingTimeS, 0),
    topSpeedKmh: counted.reduce((m, p) => Math.max(m, p.stats.topSpeedMps), 0) * 3.6,
    rides: counted.length,
    rideXp: counted.reduce((s, p) => s + rideXp(p.stats.distanceM), 0),
  };
  const distancePct = pct(oldS.distanceKm, newS.distanceKm);
  return {
    userId: user.id,
    old: oldS,
    new: newS,
    distancePct: Math.round(distancePct * 10) / 10,
    modes: {
      recomputed: plans.filter((p) => p.mode === 'recomputed').length,
      legacy: plans.filter((p) => p.mode === 'legacy').length,
      skipped: plans.filter((p) => p.mode === 'skipped').length,
    },
    excluded: skipped,
    flags: Math.abs(distancePct) > BIG_CHANGE_PCT ? ['big_change'] : [],
  };
}

function createBackfill({ prisma, rideService, core = defaultCore, log = () => {} }) {
  async function plansForUser(userId) {
    const [journeys, instances, hidden, unfinished] = await Promise.all([
      prisma.journey.findMany({ where: { userId, status: 'COMPLETED', isHidden: false } }),
      prisma.journeyInstance.findMany({
        where: { userId, status: 'COMPLETED' },
        include: { groupJourney: { select: { id: true, creatorId: true, title: true, startedAt: true, completedAt: true, endLatitude: true, endLongitude: true } } },
      }),
      prisma.journey.count({ where: { userId, status: 'COMPLETED', isHidden: true } }),
      prisma.journey.count({ where: { userId, status: { notIn: ['COMPLETED'] } } }),
    ]);
    const plans = [
      ...journeys.map((j) => planRide('journey', j, core)),
      ...instances.map((i) => planRide('instance', i, core)),
    ].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt) || a.rideId.localeCompare(b.rideId));
    return { plans, skipped: { hidden, unfinished } };
  }

  async function ensureGroup(plan) {
    const g = plan.groupJourney;
    if (!g) return null;
    const id = `lg_${g.id}`;
    await prisma.groupRide.upsert({
      where: { id },
      update: {},
      create: {
        id,
        leaderId: g.creatorId,
        title: (g.title || 'Group ride').slice(0, 120),
        code: `LEGACY-${g.id}`,
        status: 'ENDED',
        startedAt: g.startedAt,
        endedAt: g.completedAt,
        destinationLat: g.endLatitude ?? null,
        destinationLng: g.endLongitude ?? null,
      },
    });
    for (const [userId, role] of [[g.creatorId, 'LEADER'], [plan.userId, plan.userId === g.creatorId ? 'LEADER' : 'MEMBER']]) {
      await prisma.groupRideParticipant.upsert({
        where: { groupRideId_userId: { groupRideId: id, userId } },
        update: {},
        create: { groupRideId: id, userId, role },
      });
    }
    return id;
  }

  /** Writes one user's rides into v2. Returns what happened per ride. */
  async function applyUser(user, plans) {
    const foreign = await prisma.ride.count({ where: { userId: user.id, legacyJourneyId: null, status: { not: 'DELETED' } } });
    if (foreign > 0) return { applied: 0, skipped: 'has_v2_activity', failures: [] };

    // First run for this user: v2 XP starts from zero and is rebuilt from the replay below.
    const hasStats = await prisma.userStats.findUnique({ where: { userId: user.id } });
    if (!hasStats) await prisma.user.update({ where: { id: user.id }, data: { xp: 0, level: 1 } });

    let applied = 0;
    const failures = [];
    for (const plan of plans) {
      if (plan.mode === 'skipped') continue;
      try {
        const existing = await prisma.ride.findUnique({ where: { id: plan.rideId }, select: { status: true } });
        if (existing && existing.status === 'FINALIZED') continue;

        const groupRideId = await ensureGroup(plan);
        const vehicle = plan.vehicleId ? await prisma.vehicle.findFirst({ where: { id: plan.vehicleId, userId: user.id }, select: { id: true } }) : null;
        await rideService.upsertRide(
          user.id,
          plan.rideId,
          { startedAt: plan.startedAt, vehicleId: vehicle ? vehicle.id : undefined, title: plan.title || undefined },
          { groupRideId }
        );

        const legacyFlags = { legacyJourneyId: plan.legacyId, isLegacy: plan.mode === 'legacy', endedAt: plan.endedAt };
        await prisma.ride.update({
          where: { id: plan.rideId },
          data: plan.mode === 'legacy' ? { ...legacyFlags, ...plan.stats } : legacyFlags,
        });

        for (let i = 0; i < plan.points.length; i += POINT_BATCH) {
          const batch = plan.points.slice(i, i + POINT_BATCH).map((p, j) => ({
            seq: i + j, segment: 0, lat: p.lat, lng: p.lng, t: new Date(p.t).toISOString(), accuracy: p.accuracy ?? undefined,
          }));
          await rideService.addPoints(user.id, plan.rideId, batch);
        }
        await rideService.finalize(user.id, plan.rideId);
        applied++;
      } catch (err) {
        failures.push({ rideId: plan.rideId, error: err.message });
      }
    }
    return { applied, failures };
  }

  /**
   * Walks every user that has completed legacy rides. With apply=false nothing is written;
   * the result is the diff report.
   */
  async function run({ apply = false, userId, limit, pageSize = 100 } = {}) {
    const rows = [];
    let cursor;
    let processed = 0;
    for (;;) {
      const users = await prisma.user.findMany({
        where: {
          ...(userId ? { id: userId } : {}),
          OR: [{ journeys: { some: { status: 'COMPLETED' } } }, { journeyInstances: { some: { status: 'COMPLETED' } } }],
        },
        select: { id: true, totalDistance: true, totalTime: true, topSpeed: true, totalTrips: true, xp: true },
        orderBy: { id: 'asc' },
        take: pageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!users.length) break;
      for (const user of users) {
        if (limit && processed >= limit) break;
        const { plans, skipped } = await plansForUser(user.id);
        const row = summarizeUser(user, plans, skipped);
        if (apply) Object.assign(row, { result: await applyUser(user, plans) });
        rows.push(row);
        processed++;
        log(`[backfill] ${processed} ${user.id} ${row.distancePct}%`);
      }
      if (limit && processed >= limit) break;
      cursor = users[users.length - 1].id;
    }
    return { apply, generatedAt: new Date().toISOString(), totals: totalsOf(rows), users: rows };
  }

  return { run, plansForUser };
}

function totalsOf(rows) {
  const t = { users: rows.length, bigChange: 0, oldDistanceKm: 0, newDistanceKm: 0, recomputed: 0, legacy: 0, skipped: 0, failures: 0 };
  for (const r of rows) {
    t.oldDistanceKm += r.old.distanceKm;
    t.newDistanceKm += r.new.distanceKm;
    t.recomputed += r.modes.recomputed;
    t.legacy += r.modes.legacy;
    t.skipped += r.modes.skipped;
    if (r.flags.length) t.bigChange++;
    if (r.result) t.failures += r.result.failures.length;
  }
  t.oldDistanceKm = Math.round(t.oldDistanceKm * 10) / 10;
  t.newDistanceKm = Math.round(t.newDistanceKm * 10) / 10;
  return t;
}

module.exports = { createBackfill, normalizePoints, planRide, legacyTotals, summarizeUser, MIN_TRAIL_POINTS };
