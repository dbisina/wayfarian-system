// server/services/LeaderboardServiceV2.js
//
// v2 leaderboards. Postgres is the source of truth; Redis (optional) only caches results.
// Every finalize/delete bumps a version number that is part of the cache key, so a board is
// never stale for more than the moment between the write and the next read. With no Redis
// configured the boards are still correct, just uncached.

const { Prisma } = require('@prisma/client');
const defaultPrisma = require('../prisma/client');
const { MIN_COUNTED_DISTANCE_M } = require('../constants/rideXp');

const METRICS = {
  distance: { all: 'distanceM', agg: 'SUM("distanceM")' },
  topSpeed: { all: 'topSpeedMps', agg: 'MAX("topSpeedMps")' },
  rides: { all: 'rides', agg: 'COUNT(*)' },
  movingTime: { all: 'movingTimeS', agg: 'SUM("movingTimeS")' },
};
const PERIODS = { week: 7, month: 30, year: 365 };
const CACHE_TTL_S = 300;

class LeaderboardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LeaderboardError';
    this.status = 400;
    this.code = 'invalid_input';
  }
}

function parseOptions({ metric = 'distance', period = 'allTime', limit = 50, offset = 0 } = {}) {
  if (!METRICS[metric]) throw new LeaderboardError(`metric must be one of ${Object.keys(METRICS).join(', ')}`);
  if (period !== 'allTime' && !PERIODS[period]) throw new LeaderboardError('period must be allTime, week, month or year');
  return {
    metric,
    period,
    limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100),
    offset: Math.max(parseInt(offset, 10) || 0, 0),
  };
}

function createLeaderboardService({ prisma = defaultPrisma, redis = null, now = () => new Date() } = {}) {
  const VERSION_KEY = 'wayfarian:v2:lb:version';

  async function cacheKey(parts) {
    const version = redis ? (await redis.get(VERSION_KEY)) || '0' : '0';
    return `wayfarian:v2:lb:${version}:${parts.join(':')}`;
  }

  /** Call after any change that can move a board (finalize, delete, backfill). */
  async function invalidate() {
    if (!redis) return;
    try {
      await redis.incr(VERSION_KEY);
    } catch (err) {
      console.warn('[leaderboard] cache invalidation failed', err.message);
    }
  }

  async function cached(parts, ttl, compute) {
    if (!redis) return compute();
    try {
      const key = await cacheKey(parts);
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit);
      const value = await compute();
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      return value;
    } catch (err) {
      // A cache problem must never break the board.
      console.warn('[leaderboard] cache unavailable, reading from the database', err.message);
      return compute();
    }
  }

  /** Rows of { userId, value } ordered best-first, for a period, from the rides themselves. */
  async function periodRows(metric, period, limit, offset) {
    const since = new Date(now().getTime() - PERIODS[period] * 86400000);
    const agg = Prisma.raw(METRICS[metric].agg); // whitelisted constant, not user input
    return prisma.$queryRaw`
      SELECT "userId", ${agg} AS value
      FROM rides
      WHERE status = 'FINALIZED' AND "distanceM" >= ${MIN_COUNTED_DISTANCE_M} AND "startedAt" >= ${since}
      GROUP BY "userId"
      ORDER BY value DESC, "userId" ASC
      LIMIT ${limit} OFFSET ${offset}`;
  }

  async function allTimeRows(metric, limit, offset) {
    const col = METRICS[metric].all;
    const rows = await prisma.userStats.findMany({
      where: { [col]: { gt: 0 } },
      orderBy: [{ [col]: 'desc' }, { userId: 'asc' }],
      take: limit,
      skip: offset,
      select: { userId: true, [col]: true },
    });
    return rows.map((r) => ({ userId: r.userId, value: r[col] }));
  }

  async function top(options) {
    const { metric, period, limit, offset } = parseOptions(options);
    return cached(['top', metric, period, limit, offset], CACHE_TTL_S, async () => {
      const rows = period === 'allTime' ? await allTimeRows(metric, limit, offset) : await periodRows(metric, period, limit, offset);
      const users = await prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) } },
        select: { id: true, displayName: true, photoURL: true, country: true, countryCode: true, level: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        metric,
        period,
        items: rows.map((r, i) => ({
          rank: offset + i + 1,
          userId: r.userId,
          value: Number(r.value),
          displayName: byId.get(r.userId)?.displayName || null,
          photoURL: byId.get(r.userId)?.photoURL || null,
          country: byId.get(r.userId)?.country || null,
          countryCode: byId.get(r.userId)?.countryCode || null,
          level: byId.get(r.userId)?.level || 1,
        })),
      };
    });
  }

  /** The caller's own rank: 1 + the number of riders strictly ahead of them. */
  async function position(userId, options) {
    const { metric, period } = parseOptions(options);
    return cached(['pos', userId, metric, period], 60, async () => {
      let value;
      let ahead;
      if (period === 'allTime') {
        const col = METRICS[metric].all;
        const mine = await prisma.userStats.findUnique({ where: { userId } });
        value = mine ? mine[col] : 0;
        ahead = value > 0 ? await prisma.userStats.count({ where: { [col]: { gt: value } } }) : null;
      } else {
        const since = new Date(now().getTime() - PERIODS[period] * 86400000);
        const agg = Prisma.raw(METRICS[metric].agg);
        const mineRows = await prisma.$queryRaw`
          SELECT ${agg} AS value FROM rides
          WHERE status = 'FINALIZED' AND "userId" = ${userId} AND "distanceM" >= ${MIN_COUNTED_DISTANCE_M} AND "startedAt" >= ${since}`;
        value = Number(mineRows[0]?.value || 0);
        if (value > 0) {
          const aheadRows = await prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM (
              SELECT ${agg} AS value FROM rides
              WHERE status = 'FINALIZED' AND "distanceM" >= ${MIN_COUNTED_DISTANCE_M} AND "startedAt" >= ${since}
              GROUP BY "userId"
            ) t WHERE t.value > ${value}`;
          ahead = Number(aheadRows[0]?.n || 0);
        } else {
          ahead = null;
        }
      }
      return { metric, period, value: Number(value), rank: ahead === null ? null : ahead + 1 };
    });
  }

  return { top, position, invalidate };
}

module.exports = { createLeaderboardService, LeaderboardError, METRICS, PERIODS };
