// Real-database test for the backfill. Skipped unless TEST_DATABASE_URL is set; it truncates tables.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('backfill (real database)', () => {
  let prisma, backfill, rideService, u1, u2;
  const lng = (m) => 3.4 + m / (111320 * Math.cos((6.45 * Math.PI) / 180));
  const trail = (startMs, speedMps, seconds) =>
    Array.from({ length: seconds + 1 }, (_, i) => ({ lat: 6.45, lng: lng(speedMps * i), timestamp: new Date(startMs + i * 1000).toISOString() }));
  const day = (n) => Date.parse('2026-03-01T10:00:00Z') + n * 86400e3;

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const { createRideService } = require('../RideService');
    const { createBackfill } = require('../backfillV2');
    rideService = createRideService({ prisma });
    backfill = createBackfill({ prisma, rideService });
  });
  afterAll(() => prisma.$disconnect());

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "users" CASCADE');
    u1 = await prisma.user.create({ data: { firebaseUid: 'b1', displayName: 'Ada', totalDistance: 500, totalTime: 9999, topSpeed: 240, totalTrips: 4, xp: 777, level: 5 } });
    u2 = await prisma.user.create({ data: { firebaseUid: 'b2', displayName: 'Bo' } });

    const base = { startLatitude: 6.45, startLongitude: 3.4, status: 'COMPLETED' };
    // good trail, v1 claimed 25 km for what is really ~9 km
    await prisma.journey.create({ data: { ...base, userId: u1.id, startTime: new Date(day(0)), endTime: new Date(day(0) + 600e3), totalDistance: 25, totalTime: 600, topSpeed: 180, routePoints: trail(day(0), 15, 600) } });
    // no trail, plausible: kept as legacy
    await prisma.journey.create({ data: { ...base, userId: u1.id, startTime: new Date(day(1)), endTime: new Date(day(1) + 1800e3), totalDistance: 12, totalTime: 1800, topSpeed: 60 } });
    // impossible and no trail: skipped
    await prisma.journey.create({ data: { ...base, userId: u1.id, startTime: new Date(day(2)), totalDistance: 900, totalTime: 600 } });
    // hidden: excluded
    await prisma.journey.create({ data: { ...base, userId: u1.id, startTime: new Date(day(3)), totalDistance: 5, totalTime: 600, isHidden: true } });
    // active: excluded
    await prisma.journey.create({ data: { ...base, userId: u1.id, startTime: new Date(day(4)), status: 'ACTIVE' } });

    const group = await prisma.group.create({ data: { name: 'G', code: 'GGGG', creatorId: u1.id } });
    const gj = await prisma.groupJourney.create({
      data: { groupId: group.id, creatorId: u1.id, title: 'Convoy', startLatitude: 6.45, startLongitude: 3.4, status: 'COMPLETED', startedAt: new Date(day(5)), completedAt: new Date(day(5) + 900e3) },
    });
    for (const [u, speed] of [[u1, 12], [u2, 10]]) {
      await prisma.journeyInstance.create({
        data: { groupJourneyId: gj.id, userId: u.id, status: 'COMPLETED', startTime: new Date(day(5)), endTime: new Date(day(5) + 600e3), totalDistance: 3, totalTime: 600, topSpeed: 50, routePoints: trail(day(5), speed, 600).map((p) => ({ latitude: p.lat, longitude: p.lng, timestamp: p.timestamp })) },
      });
    }
  });

  test('dry run writes nothing and reports old vs new', async () => {
    const report = await backfill.run({ apply: false });
    expect(await prisma.ride.count()).toBe(0);
    expect(await prisma.userStats.count()).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: u1.id } })).xp).toBe(777);

    const r1 = report.users.find((u) => u.userId === u1.id);
    expect(r1.modes).toEqual({ recomputed: 2, legacy: 1, skipped: 1 });
    expect(r1.excluded).toEqual({ hidden: 1, unfinished: 1 });
    expect(r1.old.distanceKm).toBe(500);
    expect(r1.new.distanceKm).toBeGreaterThan(9 + 12 + 6); // 9 recomputed + 12 legacy + ~7.2 group
    expect(r1.flags).toContain('big_change');
    expect(report.totals.users).toBe(2);
  });

  test('apply rebuilds rides, totals, XP, groups; re-running changes nothing; no drift', async () => {
    const first = await backfill.run({ apply: true });
    expect(first.totals.failures).toBe(0);

    const rides = await prisma.ride.findMany({ where: { userId: u1.id }, orderBy: { startedAt: 'asc' } });
    expect(rides.map((r) => r.id)).toHaveLength(3); // solo recomputed, solo legacy, group instance
    expect(rides.every((r) => r.status === 'FINALIZED')).toBe(true);
    expect(rides[0].distanceM).toBeGreaterThan(8900);
    expect(rides[0].distanceM).toBeLessThan(9100);
    expect(rides[0].isLegacy).toBe(false);
    expect(rides[1].isLegacy).toBe(true);
    expect(rides[1].distanceM).toBe(12000);
    expect(rides[2].groupRideId).toBe('lg_' + (await prisma.groupJourney.findFirst()).id);

    const stats = await prisma.userStats.findUnique({ where: { userId: u1.id } });
    expect(stats.rides).toBe(3);
    expect(stats.distanceM).toBeCloseTo(rides.reduce((s, r) => s + r.distanceM, 0), 3);
    const user = await prisma.user.findUnique({ where: { id: u1.id } });
    expect(user.xp).not.toBe(777); // legacy XP replaced by the rebuilt value
    expect(user.xp).toBeGreaterThan(0);

    const g = await prisma.groupRide.findFirst({ include: { participants: true } });
    expect(g.status).toBe('ENDED');
    expect(g.participants.map((p) => p.userId).sort()).toEqual([u1.id, u2.id].sort());

    // v1 columns untouched, legacy tables untouched
    expect(user.totalDistance).toBe(500);
    expect(await prisma.journey.count()).toBe(5);

    const snapshot = JSON.stringify({ stats, xp: user.xp });
    const second = await backfill.run({ apply: true });
    expect(second.totals.failures).toBe(0);
    const stats2 = await prisma.userStats.findUnique({ where: { userId: u1.id } });
    const user2 = await prisma.user.findUnique({ where: { id: u1.id } });
    expect(JSON.stringify({ stats: stats2, xp: user2.xp })).toBe(snapshot);
    expect(await prisma.ride.count({ where: { userId: u1.id } })).toBe(3);

    const { driftCheck } = require('../../jobs/v2Jobs');
    expect((await driftCheck({ prisma })).drifted).toEqual([]);
  });

  test('a user who already used v2 is left alone', async () => {
    await rideService.upsertRide(u1.id, 'native-ride-0001', { startedAt: new Date().toISOString() });
    const report = await backfill.run({ apply: true });
    const r1 = report.users.find((u) => u.userId === u1.id);
    expect(r1.result.skipped).toBe('has_v2_activity');
    expect(await prisma.ride.count({ where: { userId: u1.id } })).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: u1.id } })).xp).toBe(777);
  });
});
