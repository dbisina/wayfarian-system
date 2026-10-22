// server/jobs/v2Jobs.js
//
// Maintenance jobs for the v2 ride engine. The job bodies are plain functions that take their
// dependencies, so they can be tested without Redis. The scheduler at the bottom runs them
// through BullMQ when REDIS_URL is set; BullMQ gives us one runner across all server
// instances, which the old in-memory interval timers could not.

const { MIN_COUNTED_DISTANCE_M } = require('../constants/rideXp');

const STALE_AFTER_MS = 6 * 3600 * 1000; // a ride untouched for 6 h was abandoned
const DRIFT_EPSILON_M = 1; // metres
const DRIFT_EPSILON_S = 1; // seconds

/**
 * Finalizes rides the app never finished (crash, uninstall, lost phone), so their distance is
 * credited instead of sitting in RECORDING forever. Goes through the same transaction as a
 * normal finalize.
 */
async function finalizeStaleRides({ prisma, rideService, now = new Date(), limit = 200 }) {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const stale = await prisma.ride.findMany({
    where: { status: { in: ['RECORDING', 'PAUSED', 'ENDED'] }, updatedAt: { lt: cutoff } },
    select: { id: true, userId: true },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  });
  let finalized = 0;
  const failures = [];
  for (const r of stale) {
    try {
      await rideService.finalize(r.userId, r.id);
      finalized++;
    } catch (err) {
      failures.push({ rideId: r.id, error: err.message });
    }
  }
  return { checked: stale.length, finalized, failures };
}

/**
 * Compares each user's running totals with what their finalized rides add up to. Any gap means
 * a bug or a crashed write somewhere. Reports it, and repairs it when `repair` is true.
 */
async function driftCheck({ prisma, repair = false }) {
  const sums = await prisma.ride.groupBy({
    by: ['userId'],
    where: { status: 'FINALIZED', distanceM: { gte: MIN_COUNTED_DISTANCE_M } },
    _sum: { distanceM: true, movingTimeS: true, elapsedTimeS: true },
    _count: { _all: true },
    _max: { topSpeedMps: true },
  });
  const stats = await prisma.userStats.findMany();
  const byUser = new Map(stats.map((s) => [s.userId, s]));
  const seen = new Set();
  const drifted = [];

  const expectedOf = (g) => ({
    distanceM: g._sum.distanceM || 0,
    movingTimeS: g._sum.movingTimeS || 0,
    elapsedTimeS: g._sum.elapsedTimeS || 0,
    rides: g._count._all,
    topSpeedMps: g._max.topSpeedMps || 0,
  });

  for (const g of sums) {
    seen.add(g.userId);
    const want = expectedOf(g);
    const have = byUser.get(g.userId);
    const diff = {
      distanceM: (have?.distanceM || 0) - want.distanceM,
      movingTimeS: (have?.movingTimeS || 0) - want.movingTimeS,
      elapsedTimeS: (have?.elapsedTimeS || 0) - want.elapsedTimeS,
      rides: (have?.rides || 0) - want.rides,
      topSpeedMps: (have?.topSpeedMps || 0) - want.topSpeedMps,
    };
    if (
      Math.abs(diff.distanceM) > DRIFT_EPSILON_M ||
      Math.abs(diff.movingTimeS) > DRIFT_EPSILON_S ||
      Math.abs(diff.elapsedTimeS) > DRIFT_EPSILON_S ||
      diff.rides !== 0 ||
      Math.abs(diff.topSpeedMps) > 0.01
    ) {
      drifted.push({ userId: g.userId, have, want, diff });
      if (repair) {
        await prisma.userStats.upsert({ where: { userId: g.userId }, create: { userId: g.userId, ...want }, update: want });
      }
    }
  }

  // Users with totals but no counted rides at all should have zero totals.
  for (const s of stats) {
    if (seen.has(s.userId)) continue;
    if (s.distanceM > DRIFT_EPSILON_M || s.rides !== 0) {
      const want = { distanceM: 0, movingTimeS: 0, elapsedTimeS: 0, rides: 0, topSpeedMps: 0 };
      drifted.push({ userId: s.userId, have: s, want, diff: { distanceM: s.distanceM, rides: s.rides } });
      if (repair) await prisma.userStats.update({ where: { userId: s.userId }, data: want });
    }
  }
  return { usersChecked: stats.length, drifted, repaired: repair ? drifted.length : 0 };
}

/**
 * Starts the repeating jobs. Safe to call on every server instance: BullMQ de-duplicates the
 * repeatable schedules and only one worker takes each run.
 */
function startV2Jobs({ prisma, rideService, redisUrl = process.env.REDIS_URL, logger = console }) {
  if (!redisUrl) {
    logger.info?.('[v2-jobs] REDIS_URL not set, scheduled jobs disabled');
    return { stop: async () => {} };
  }
  const { Queue, Worker } = require('bullmq');
  const IORedis = require('ioredis');
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.warn?.('[v2-jobs] redis', err.message));
  const prefix = 'wayfarian-v2'; // keeps these queues apart from anything else on the instance

  const queue = new Queue('maintenance', { connection, prefix });
  const worker = new Worker(
    'maintenance',
    async (job) => {
      if (job.name === 'finalize-stale-rides') return finalizeStaleRides({ prisma, rideService });
      if (job.name === 'drift-check') {
        const res = await driftCheck({ prisma, repair: false });
        if (res.drifted.length) logger.error?.(`[v2-jobs] DRIFT in ${res.drifted.length} user(s)`, JSON.stringify(res.drifted.slice(0, 5)));
        return { usersChecked: res.usersChecked, drifted: res.drifted.length };
      }
      return null;
    },
    { connection, prefix, concurrency: 1 }
  );
  worker.on('failed', (job, err) => logger.error?.(`[v2-jobs] ${job?.name} failed`, err.message));

  queue.add('finalize-stale-rides', {}, { repeat: { every: 15 * 60 * 1000 }, removeOnComplete: 20, removeOnFail: 50 }).catch(() => {});
  queue.add('drift-check', {}, { repeat: { pattern: '0 3 * * *' }, removeOnComplete: 20, removeOnFail: 50 }).catch(() => {});

  return {
    stop: async () => {
      await worker.close().catch(() => {});
      await queue.close().catch(() => {});
      await connection.quit().catch(() => {});
    },
  };
}

module.exports = { finalizeStaleRides, driftCheck, startV2Jobs, STALE_AFTER_MS };
