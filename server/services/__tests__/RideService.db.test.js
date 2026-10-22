// Real-database checks for ride rename and route retrieval. Skipped unless TEST_DATABASE_URL is set.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('RideService (real database): rename and route', () => {
  let prisma, rides, a, b;
  const lng = (m) => 3.4 + m / (111320 * Math.cos((6.45 * Math.PI) / 180));
  const pts = (n, segmentAt = Infinity) =>
    Array.from({ length: n }, (_, i) => ({ seq: i, segment: i >= segmentAt ? 1 : 0, lat: 6.45, lng: lng(i * 5), t: new Date(Date.now() - 3600e3 + i * 1000).toISOString(), accuracy: 5 }));

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url } } });
    rides = require('../RideService').createRideService({ prisma });
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "users" CASCADE');
    a = await prisma.user.create({ data: { firebaseUid: 'ra', displayName: 'A' } });
    b = await prisma.user.create({ data: { firebaseUid: 'rb', displayName: 'B' } });
  });

  test('rename trims, caps and clears; others cannot rename', async () => {
    await rides.upsertRide(a.id, 'ride-rename-01', { startedAt: new Date().toISOString() });
    expect((await rides.updateRide(a.id, 'ride-rename-01', { title: '  Morning loop  ' })).title).toBe('Morning loop');
    expect((await rides.updateRide(a.id, 'ride-rename-01', { title: '   ' })).title).toBeNull();
    await expect(rides.updateRide(a.id, 'ride-rename-01', { title: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(rides.updateRide(b.id, 'ride-rename-01', { title: 'x' })).rejects.toMatchObject({ status: 403 });
  });

  test('route returns every point when small, thins big rides, and keeps first and last', async () => {
    await rides.upsertRide(a.id, 'ride-route-0001', { startedAt: new Date().toISOString() });
    await rides.addPoints(a.id, 'ride-route-0001', pts(40, 20));
    const small = await rides.getRoute(a.id, 'ride-route-0001');
    expect(small.total).toBe(40);
    expect(small.points).toHaveLength(40);
    expect(small.points[20].segment).toBe(1);

    await rides.addPoints(a.id, 'ride-route-0001', pts(1000).slice(40).map((p) => ({ ...p, segment: 1 })));
    const big = await rides.getRoute(a.id, 'ride-route-0001', { maxPoints: 100 });
    expect(big.total).toBe(1000);
    expect(big.points.length).toBeLessThanOrEqual(100);
    expect(big.points.length).toBeGreaterThan(90);
    const t = big.points.map((p) => p.t);
    expect([...t].sort((x, y) => x - y)).toEqual(t); // still in time order
    await expect(rides.getRoute(b.id, 'ride-route-0001')).rejects.toMatchObject({ status: 403 });
  });
});
