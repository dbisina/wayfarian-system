const { cacheLeaderboard } = require('../cache');
const { cacheService } = require('../../services/CacheService');

const run = (mw, req) =>
  new Promise((resolve) => {
    const res = {
      headers: {},
      set(h) { Object.assign(this.headers, h); return this; },
      json(body) { resolve({ body, headers: this.headers }); return this; },
    };
    mw(req, res, () => res.json({ calledNext: true, user: req.user.id, path: req.path }));
  });

describe('cacheLeaderboard', () => {
  beforeEach(() => cacheService.clear && cacheService.clear());

  test("never serves one user's response to another user", async () => {
    const mw = cacheLeaderboard(600);
    await run(mw, { path: '/', query: {}, user: { id: 'a' } });
    const second = await run(mw, { path: '/', query: {}, user: { id: 'b' } });
    expect(second.headers['X-Cache']).toBe('MISS');
    expect(second.body.user).toBe('b');
  });

  test('different paths do not share a cache entry', async () => {
    const mw = cacheLeaderboard(600);
    await run(mw, { path: '/position', query: {}, user: { id: 'a' } });
    const other = await run(mw, { path: '/group/123', query: {}, user: { id: 'a' } });
    expect(other.headers['X-Cache']).toBe('MISS');
  });

  test('same user, path and query hits the cache regardless of _t buster', async () => {
    const mw = cacheLeaderboard(600);
    await run(mw, { path: '/', query: { sortBy: 'topSpeed', _t: '1' }, user: { id: 'a' } });
    const again = await run(mw, { path: '/', query: { sortBy: 'topSpeed', _t: '2' }, user: { id: 'a' } });
    expect(again.headers['X-Cache']).toBe('HIT');
    expect(again.headers['Cache-Control']).toMatch(/^private/);
  });
});
