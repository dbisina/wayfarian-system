const { finalizeStaleRides, driftCheck, STALE_AFTER_MS } = require('../v2Jobs');
const { createLeaderboardService } = require('../../services/LeaderboardServiceV2');

describe('finalizeStaleRides', () => {
  test('finalizes only rides untouched past the cutoff, and keeps going after a failure', async () => {
    const now = new Date('2026-10-02T12:00:00Z');
    const rides = [
      { id: 'old-1', userId: 'u1', updatedAt: new Date(now - STALE_AFTER_MS - 1000), status: 'RECORDING' },
      { id: 'old-2', userId: 'u2', updatedAt: new Date(now - STALE_AFTER_MS - 5000), status: 'PAUSED' },
      { id: 'fresh', userId: 'u3', updatedAt: new Date(now - 1000), status: 'RECORDING' },
    ];
    const prisma = {
      ride: {
        findMany: jest.fn(async ({ where }) => rides.filter((r) => where.status.in.includes(r.status) && r.updatedAt < where.updatedAt.lt)),
      },
    };
    const rideService = {
      finalize: jest.fn(async (userId, id) => {
        if (id === 'old-1') throw new Error('boom');
        return { id };
      }),
    };
    const res = await finalizeStaleRides({ prisma, rideService, now });
    expect(res.checked).toBe(2);
    expect(res.finalized).toBe(1);
    expect(res.failures).toEqual([{ rideId: 'old-1', error: 'boom' }]);
    expect(rideService.finalize).not.toHaveBeenCalledWith('u3', 'fresh');
  });
});

describe('driftCheck', () => {
  const group = (userId, d, t, e, n, top) => ({
    userId,
    _sum: { distanceM: d, movingTimeS: t, elapsedTimeS: e },
    _count: { _all: n },
    _max: { topSpeedMps: top },
  });

  test('reports users whose totals disagree with their rides, and repairs on request', async () => {
    const stats = [
      { userId: 'ok', distanceM: 1000, movingTimeS: 100, elapsedTimeS: 120, rides: 1, topSpeedMps: 10 },
      { userId: 'bad', distanceM: 9999, movingTimeS: 100, elapsedTimeS: 120, rides: 2, topSpeedMps: 10 },
      { userId: 'ghost', distanceM: 500, movingTimeS: 50, elapsedTimeS: 50, rides: 1, topSpeedMps: 5 },
    ];
    const upsert = jest.fn();
    const update = jest.fn();
    const prisma = {
      ride: { groupBy: jest.fn(async () => [group('ok', 1000, 100, 120, 1, 10), group('bad', 2000, 100, 120, 2, 10)]) },
      userStats: { findMany: jest.fn(async () => stats), upsert, update },
    };

    const dry = await driftCheck({ prisma, repair: false });
    expect(dry.drifted.map((d) => d.userId).sort()).toEqual(['bad', 'ghost']);
    expect(upsert).not.toHaveBeenCalled();

    const fixed = await driftCheck({ prisma, repair: true });
    expect(fixed.repaired).toBe(2);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'bad' }, update: expect.objectContaining({ distanceM: 2000, rides: 2 }) }));
    expect(update).toHaveBeenCalledWith({ where: { userId: 'ghost' }, data: expect.objectContaining({ distanceM: 0, rides: 0 }) });
  });

  test('reports nothing when totals match', async () => {
    const prisma = {
      ride: { groupBy: jest.fn(async () => [group('a', 1000, 100, 120, 1, 10)]) },
      userStats: { findMany: jest.fn(async () => [{ userId: 'a', distanceM: 1000.2, movingTimeS: 100, elapsedTimeS: 120, rides: 1, topSpeedMps: 10 }]) },
    };
    expect((await driftCheck({ prisma })).drifted).toEqual([]);
  });
});

describe('leaderboard (all-time) and cache', () => {
  const makePrisma = () => ({
    userStats: {
      findMany: jest.fn(async () => [
        { userId: 'a', distanceM: 5000 },
        { userId: 'b', distanceM: 3000 },
      ]),
      findUnique: jest.fn(async () => ({ userId: 'b', distanceM: 3000 })),
      count: jest.fn(async () => 1),
    },
    user: { findMany: jest.fn(async () => [{ id: 'a', displayName: 'Ada', level: 3 }, { id: 'b', displayName: 'Bo', level: 1 }]) },
  });
  const makeRedis = () => {
    const store = new Map();
    return {
      store,
      get: jest.fn(async (k) => store.get(k) ?? null),
      set: jest.fn(async (k, v) => { store.set(k, v); }),
      incr: jest.fn(async (k) => { store.set(k, String(Number(store.get(k) || 0) + 1)); }),
    };
  };

  test('ranks best first and rejects bad options', async () => {
    const svc = createLeaderboardService({ prisma: makePrisma() });
    const res = await svc.top({ metric: 'distance' });
    expect(res.items.map((i) => [i.rank, i.userId, i.value])).toEqual([[1, 'a', 5000], [2, 'b', 3000]]);
    expect(res.items[0].displayName).toBe('Ada');
    await expect(svc.top({ metric: 'bogus' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.top({ period: 'decade' })).rejects.toMatchObject({ status: 400 });
  });

  test("a rider's own rank is one plus the riders ahead of them", async () => {
    const svc = createLeaderboardService({ prisma: makePrisma() });
    expect(await svc.position('b', { metric: 'distance' })).toMatchObject({ rank: 2, value: 3000 });
  });

  test('cached until invalidated, and a cache outage falls back to the database', async () => {
    const prisma = makePrisma();
    const redis = makeRedis();
    const svc = createLeaderboardService({ prisma, redis });
    await svc.top({});
    await svc.top({});
    expect(prisma.userStats.findMany).toHaveBeenCalledTimes(1);
    await svc.invalidate();
    await svc.top({});
    expect(prisma.userStats.findMany).toHaveBeenCalledTimes(2);

    redis.get.mockRejectedValue(new Error('redis down'));
    const res = await svc.top({});
    expect(res.items).toHaveLength(2);
  });
});
