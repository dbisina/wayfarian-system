// server/services/RideService.js
//
// v2 ride engine. Every write is idempotent (client-generated ids, seq-deduped points,
// guarded finalize) so the app can retry anything after a dropped connection.
// Stats are always computed here with @wayfarian/ride-core; client totals are never trusted.

const defaultPrisma = require('../prisma/client');
const rideCore = require('@wayfarian/ride-core');
const { rideXp, countsAsRide } = require('../constants/rideXp');
const { calculateLevel } = require('../constants/xpSystem');
const achievements = require('./achievementsV2');

class RideError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'RideError';
    this.code = code;
    this.status = status;
  }
}

// Finalize/delete make a dozen queries in one transaction. Prisma's 5 s default is not enough
// when the database is a network hop away (it rolled back against Railway), so allow more.
const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };
const MAX_POINTS_PER_BATCH = 1000;
const MAX_EVENTS_PER_BATCH = 50;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const asDate = (v, field) => {
  const d = new Date(v);
  if (v == null || Number.isNaN(d.getTime())) throw new RideError('invalid_input', 400, `${field} must be a valid date`);
  return d;
};

const assertId = (id, field = 'id') => {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new RideError('invalid_input', 400, `${field} must be 8-64 chars of letters, digits, _ or -`);
  }
};

function createRideService({ prisma = defaultPrisma, core = rideCore, onStatsChanged = async () => {} } = {}) {
  // A failing side effect (cache invalidation) must never fail a committed write.
  const safely = async (fn) => {
    try {
      await fn();
    } catch (err) {
      console.warn('[RideService] post-commit hook failed', err.message);
    }
  };

  async function ownedRide(db, userId, rideId) {
    const ride = await db.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new RideError('not_found', 404, 'Ride not found');
    if (ride.userId !== userId) throw new RideError('forbidden', 403, 'Not your ride');
    return ride;
  }

  /** Idempotent create. Re-sending the same id returns the stored ride unchanged. */
  async function upsertRide(userId, rideId, input = {}, { groupRideId = null } = {}) {
    assertId(rideId, 'rideId');
    const startedAt = asDate(input.startedAt, 'startedAt');

    const existing = await prisma.ride.findUnique({ where: { id: rideId } });
    if (existing) {
      if (existing.userId !== userId) throw new RideError('forbidden', 403, 'Not your ride');
      if (groupRideId && existing.groupRideId !== groupRideId) {
        throw new RideError('conflict', 409, 'Ride already exists outside this group ride');
      }
      return existing;
    }

    if (input.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({ where: { id: input.vehicleId, userId }, select: { id: true } });
      if (!vehicle) throw new RideError('invalid_input', 400, 'vehicleId does not belong to this user');
    }

    try {
      return await prisma.ride.create({
        data: {
          id: rideId,
          userId,
          startedAt,
          vehicleId: input.vehicleId || null,
          groupRideId,
          title: typeof input.title === 'string' ? input.title.slice(0, 120) : null,
          timezone: typeof input.timezone === 'string' ? input.timezone.slice(0, 64) : null,
        },
      });
    } catch (err) {
      // Two retries raced: the other one won, so return what it stored.
      if (err && err.code === 'P2002') return ownedRide(prisma, userId, rideId);
      throw err;
    }
  }

  /** Batch insert. Duplicate (rideId, seq) pairs are ignored, so replays are harmless. */
  async function addPoints(userId, rideId, points) {
    const ride = await ownedRide(prisma, userId, rideId);
    if (ride.status === 'DELETED') throw new RideError('conflict', 409, 'Ride was deleted');
    if (!Array.isArray(points) || points.length === 0) throw new RideError('invalid_input', 400, 'points must be a non-empty array');
    if (points.length > MAX_POINTS_PER_BATCH) {
      throw new RideError('invalid_input', 400, `at most ${MAX_POINTS_PER_BATCH} points per batch`);
    }

    const data = points.map((p, i) => {
      const where = `points[${i}]`;
      if (!Number.isInteger(p.seq) || p.seq < 0) throw new RideError('invalid_input', 400, `${where}.seq must be a non-negative integer`);
      const segment = p.segment == null ? 0 : p.segment;
      if (!Number.isInteger(segment) || segment < 0) throw new RideError('invalid_input', 400, `${where}.segment must be a non-negative integer`);
      if (!core.isValidCoordinate(p.lat, p.lng)) throw new RideError('invalid_input', 400, `${where} has invalid coordinates`);
      return {
        rideId,
        seq: p.seq,
        segment,
        lat: p.lat,
        lng: p.lng,
        recordedAt: asDate(p.t, `${where}.t`),
        accuracy: Number.isFinite(p.accuracy) ? p.accuracy : null,
      };
    });

    const { count } = await prisma.ridePoint.createMany({ data, skipDuplicates: true });

    // Late points on a finalized ride: recompute so totals follow the data.
    let finalized = null;
    if (ride.status === 'FINALIZED' && count > 0) finalized = await finalize(userId, rideId);

    return { accepted: count, duplicates: data.length - count, ride: finalized };
  }

  /** Records start/pause/resume/end and moves the ride status. Events are deduped by their id. */
  async function addEvents(userId, rideId, events) {
    const ride = await ownedRide(prisma, userId, rideId);
    if (ride.status === 'DELETED') throw new RideError('conflict', 409, 'Ride was deleted');
    if (!Array.isArray(events) || events.length === 0) throw new RideError('invalid_input', 400, 'events must be a non-empty array');
    if (events.length > MAX_EVENTS_PER_BATCH) throw new RideError('invalid_input', 400, `at most ${MAX_EVENTS_PER_BATCH} events per batch`);

    const TYPES = ['START', 'PAUSE', 'RESUME', 'END'];
    const rows = events.map((e, i) => {
      assertId(e.id, `events[${i}].id`);
      if (!TYPES.includes(e.type)) throw new RideError('invalid_input', 400, `events[${i}].type must be one of ${TYPES.join(', ')}`);
      return { id: e.id, rideId, type: e.type, at: asDate(e.at, `events[${i}].at`) };
    });

    const { count } = await prisma.rideLifecycleEvent.createMany({ data: rows, skipDuplicates: true });

    if (ride.status !== 'FINALIZED') {
      // Status follows the newest event, whichever order batches arrive in.
      const latest = await prisma.rideLifecycleEvent.findFirst({ where: { rideId }, orderBy: { at: 'desc' } });
      const next = { START: 'RECORDING', PAUSE: 'PAUSED', RESUME: 'RECORDING', END: 'ENDED' }[latest.type];
      const patch = { status: next };
      if (latest.type === 'END') patch.endedAt = latest.at;
      await prisma.ride.update({ where: { id: rideId }, data: patch });
    }

    return { accepted: count, duplicates: rows.length - count };
  }

  async function loadSegments(db, rideId) {
    const rows = await db.ridePoint.findMany({
      where: { rideId },
      orderBy: [{ segment: 'asc' }, { recordedAt: 'asc' }],
      select: { segment: true, lat: true, lng: true, recordedAt: true, accuracy: true },
    });
    const bySegment = new Map();
    for (const r of rows) {
      if (!bySegment.has(r.segment)) bySegment.set(r.segment, []);
      bySegment.get(r.segment).push({ lat: r.lat, lng: r.lng, t: r.recordedAt.getTime(), accuracy: r.accuracy });
    }
    return { segments: [...bySegment.values()], pointCount: rows.length, lastAt: rows.length ? rows[rows.length - 1].recordedAt : null };
  }

  const recomputeTopSpeed = async (tx, userId) => {
    const agg = await tx.ride.aggregate({ where: { userId, status: 'FINALIZED' }, _max: { topSpeedMps: true } });
    return agg._max.topSpeedMps || 0;
  };

  async function applyXpDelta(tx, userId, source, amount) {
    const existing = await tx.xpLedger.findUnique({ where: { userId_source: { userId, source } } });
    const delta = amount - (existing ? existing.amount : 0);
    if (existing) {
      if (delta !== 0) await tx.xpLedger.update({ where: { id: existing.id }, data: { amount } });
    } else if (amount > 0) {
      await tx.xpLedger.create({ data: { userId, source, amount } });
    }
    if (delta !== 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
      const xp = Math.max(0, (user?.xp || 0) + delta);
      await tx.user.update({ where: { id: userId }, data: { xp, level: calculateLevel(xp) } });
    }
    return delta;
  }

  /**
   * Computes authoritative stats from the stored points and credits the user.
   * Safe to call any number of times: the first call credits, later calls only apply the
   * difference (zero if the points did not change). One transaction, so a crash or a
   * concurrent call can never double-credit.
   */
  async function finalize(userId, rideId) {
    assertId(rideId, 'rideId');
    const result = await prisma.$transaction(async (tx) => {
      let ride = await ownedRide(tx, userId, rideId);
      if (ride.status === 'DELETED') throw new RideError('conflict', 409, 'Ride was deleted');

      const { segments, pointCount, lastAt } = await loadSegments(tx, rideId);
      // A backfilled ride with no usable GPS trail keeps the totals the backfill stored on it.
      const keepStored = ride.isLegacy && pointCount === 0;
      const stats = keepStored
        ? { distanceM: ride.distanceM, movingTimeS: ride.movingTimeS, elapsedTimeS: ride.elapsedTimeS, topSpeedMps: ride.topSpeedMps, avgSpeedMps: ride.avgSpeedMps }
        : core.computeRideStats(segments);
      const next = {
        distanceM: stats.distanceM,
        movingTimeS: Math.round(stats.movingTimeS),
        elapsedTimeS: Math.round(stats.elapsedTimeS),
        topSpeedMps: stats.topSpeedMps,
        avgSpeedMps: stats.avgSpeedMps,
        pointCount,
      };

      let first = false;
      if (!ride.finalizedAt) {
        // Claim: only one concurrent caller gets count === 1.
        const claimed = await tx.ride.updateMany({
          where: { id: rideId, finalizedAt: null },
          data: { status: 'FINALIZED', finalizedAt: new Date() },
        });
        first = claimed.count === 1;
        ride = await tx.ride.findUnique({ where: { id: rideId } });
      }

      // What this ride has already contributed (zero if it was never credited).
      const prior = first
        ? { distanceM: 0, movingTimeS: 0, elapsedTimeS: 0, counted: false }
        : { distanceM: ride.distanceM, movingTimeS: ride.movingTimeS, elapsedTimeS: ride.elapsedTimeS, counted: countsAsRide(ride.distanceM) };
      const counted = countsAsRide(next.distanceM);
      // Stored totals only include counted rides.
      const priorAdd = prior.counted ? prior : { distanceM: 0, movingTimeS: 0, elapsedTimeS: 0 };
      const nextAdd = counted ? next : { distanceM: 0, movingTimeS: 0, elapsedTimeS: 0 };

      const saved = await tx.ride.update({
        where: { id: rideId },
        data: {
          ...next,
          status: 'FINALIZED',
          endedAt: ride.endedAt || lastAt || new Date(),
          statsVersion: 1,
        },
      });

      await tx.userStats.upsert({
        where: { userId },
        create: {
          userId,
          distanceM: nextAdd.distanceM,
          movingTimeS: nextAdd.movingTimeS,
          elapsedTimeS: nextAdd.elapsedTimeS,
          rides: counted ? 1 : 0,
          topSpeedMps: 0,
        },
        update: {
          distanceM: { increment: nextAdd.distanceM - priorAdd.distanceM },
          movingTimeS: { increment: nextAdd.movingTimeS - priorAdd.movingTimeS },
          elapsedTimeS: { increment: nextAdd.elapsedTimeS - priorAdd.elapsedTimeS },
          rides: { increment: (counted ? 1 : 0) - (prior.counted ? 1 : 0) },
        },
      });
      await tx.userStats.update({
        where: { userId },
        data: { topSpeedMps: await recomputeTopSpeed(tx, userId) },
      });

      await applyXpDelta(tx, userId, `ride:${rideId}`, rideXp(next.distanceM));
      const newAchievements = await achievements.awardForRide(tx, userId, saved);

      return { ...saved, newAchievements };
    }, TX_OPTIONS);
    await safely(onStatsChanged);
    return result;
  }

  /** Removes a ride and reverses exactly what it contributed. Idempotent. */
  async function deleteRide(userId, rideId) {
    assertId(rideId, 'rideId');
    const result = await prisma.$transaction(async (tx) => {
      const ride = await ownedRide(tx, userId, rideId);
      if (ride.status === 'DELETED') return ride;

      if (ride.status === 'FINALIZED' && countsAsRide(ride.distanceM)) {
        await tx.userStats.update({
          where: { userId },
          data: {
            distanceM: { decrement: ride.distanceM },
            movingTimeS: { decrement: ride.movingTimeS },
            elapsedTimeS: { decrement: ride.elapsedTimeS },
            rides: { decrement: 1 },
          },
        });
      }
      const gone = await tx.ride.update({ where: { id: rideId }, data: { status: 'DELETED', deletedAt: new Date() } });
      if (ride.status === 'FINALIZED') {
        const stats = await tx.userStats.findUnique({ where: { userId } });
        if (stats) await tx.userStats.update({ where: { userId }, data: { topSpeedMps: await recomputeTopSpeed(tx, userId) } });
        await applyXpDelta(tx, userId, `ride:${rideId}`, 0);
      }
      return gone;
    }, TX_OPTIONS);
    await safely(onStatsChanged);
    return result;
  }

  async function getRide(userId, rideId) {
    const ride = await ownedRide(prisma, userId, rideId);
    if (ride.status === 'DELETED') throw new RideError('not_found', 404, 'Ride not found');
    return ride;
  }

  /** Rename a ride. The only user-editable field; stats are never editable. */
  async function updateRide(userId, rideId, patch = {}) {
    assertId(rideId, 'rideId');
    const ride = await ownedRide(prisma, userId, rideId);
    if (ride.status === 'DELETED') throw new RideError('not_found', 404, 'Ride not found');
    if (typeof patch.title !== 'string') throw new RideError('invalid_input', 400, 'title must be a string');
    const title = patch.title.trim().slice(0, 120);
    return prisma.ride.update({ where: { id: rideId }, data: { title: title || null } });
  }

  /**
   * The route to draw. Returns at most maxPoints, evenly thinned, always keeping the first and
   * last fix and the segment each point belongs to (so a pause shows as a gap, not a line).
   */
  async function getRoute(userId, rideId, { maxPoints = 1500 } = {}) {
    assertId(rideId, 'rideId');
    const ride = await ownedRide(prisma, userId, rideId);
    if (ride.status === 'DELETED') throw new RideError('not_found', 404, 'Ride not found');
    const rows = await prisma.ridePoint.findMany({
      where: { rideId },
      orderBy: [{ segment: 'asc' }, { recordedAt: 'asc' }],
      select: { segment: true, lat: true, lng: true, recordedAt: true },
    });
    const cap = Math.min(Math.max(parseInt(maxPoints, 10) || 1500, 2), 5000);
    const step = rows.length > cap ? (rows.length - 1) / (cap - 1) : 1;
    const picked = [];
    for (let i = 0; i < rows.length; i = Math.round(picked.length * step)) {
      picked.push(rows[i]);
      if (picked.length >= cap) break;
    }
    if (rows.length && picked[picked.length - 1] !== rows[rows.length - 1]) picked[picked.length - 1] = rows[rows.length - 1];
    return { total: rows.length, points: picked.map((r) => ({ segment: r.segment, lat: r.lat, lng: r.lng, t: r.recordedAt.getTime() })) };
  }

  /** Cursor pagination, newest first. The cursor is the last ride's id. */
  async function listRides(userId, { cursor, limit = 20 } = {}) {
    const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const rows = await prisma.ride.findMany({
      where: { userId, status: { not: 'DELETED' } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async function getStreak(userId, now = new Date()) {
    const since = new Date(now.getTime() - 400 * 86400000);
    const rows = await prisma.ride.findMany({
      where: {
        userId,
        status: 'FINALIZED',
        distanceM: { gte: achievements.QUALIFY_MIN_DISTANCE_M },
        startedAt: { gte: since },
      },
      select: { startedAt: true, timezone: true },
    });
    return achievements.computeStreak(rows, now);
  }

  async function getSummary(userId) {
    const [stats, user, streak, earned] = await Promise.all([
      prisma.userStats.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { xp: true, level: true } }),
      getStreak(userId),
      prisma.rideAchievement.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' }, select: { achievementId: true, xpAwarded: true, earnedAt: true } }),
    ]);
    return {
      distanceM: stats?.distanceM || 0,
      movingTimeS: stats?.movingTimeS || 0,
      elapsedTimeS: stats?.elapsedTimeS || 0,
      topSpeedMps: stats?.topSpeedMps || 0,
      rides: stats?.rides || 0,
      xp: user?.xp || 0,
      level: user?.level || 1,
      streak,
      achievements: earned,
    };
  }

  return { upsertRide, addPoints, addEvents, finalize, deleteRide, getRide, updateRide, getRoute, listRides, getSummary, getStreak };
}

module.exports = { createRideService, RideError };
