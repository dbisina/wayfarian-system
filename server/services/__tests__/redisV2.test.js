const { createLeaderboardService } = require('../LeaderboardServiceV2');

describe('v2 Redis client with an unreachable server', () => {
  const OLD = process.env.REDIS_URL;
  afterEach(async () => {
    process.env.REDIS_URL = OLD;
    jest.resetModules();
  });

  test('commands fail immediately instead of waiting for Redis to come back', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1'; // nothing listens here
    jest.resetModules();
    const { getRedis, closeRedis } = require('../redisV2');
    const redis = getRedis();
    const t0 = Date.now();
    await expect(redis.get('k')).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(2500);
    await closeRedis();
  });

  test('the leaderboard still answers from the database, quickly, when the cache is down', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    jest.resetModules();
    const { getRedis, closeRedis } = require('../redisV2');
    const prisma = {
      userStats: { findMany: jest.fn(async () => [{ userId: 'a', distanceM: 5000 }]) },
      user: { findMany: jest.fn(async () => [{ id: 'a', displayName: 'Ada', level: 2 }]) },
    };
    const svc = createLeaderboardService({ prisma, redis: getRedis() });
    const t0 = Date.now();
    const res = await svc.top({ metric: 'distance' });
    expect(res.items[0]).toMatchObject({ userId: 'a', value: 5000 });
    expect(Date.now() - t0).toBeLessThan(3000);
    await closeRedis();
  });

  test('no REDIS_URL means no client at all', () => {
    delete process.env.REDIS_URL;
    jest.resetModules();
    expect(require('../redisV2').getRedis()).toBeNull();
  });
});
