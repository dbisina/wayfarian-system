// Integration test against a real Postgres. Skipped unless TEST_DATABASE_URL is set, because
// the group ride rules (unique membership, guarded status changes, SQL aggregation of rides)
// are only meaningful against the real database. Never point this at a shared database: it
// truncates tables.
//
//   TEST_DATABASE_URL=postgresql://wf:wf@localhost:54329/wf_test npx prisma db push && npx jest GroupRideService.db

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('GroupRideService (real database)', () => {
  let prisma, rides, groups, a, b, c;
  const trace = (startMs, speedMps, seconds) =>
    Array.from({ length: seconds + 1 }, (_, i) => ({
      seq: i,
      segment: 0,
      lat: 6.45,
      lng: 3.4 + (speedMps * i) / (111320 * Math.cos((6.45 * Math.PI) / 180)),
      t: new Date(startMs + i * 1000).toISOString(),
      accuracy: 5,
    }));

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const { createRideService } = require('../RideService');
    const { createGroupRideService } = require('../GroupRideService');
    rides = createRideService({ prisma });
    groups = createGroupRideService({ prisma, rideService: rides });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "users" CASCADE');
    a = await prisma.user.create({ data: { firebaseUid: 'ga', displayName: 'Ada' } });
    b = await prisma.user.create({ data: { firebaseUid: 'gb', displayName: 'Bo' } });
    c = await prisma.user.create({ data: { firebaseUid: 'gc', displayName: 'Cy' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const GID = 'group-ride-0001';

  test('create is idempotent and makes the creator leader', async () => {
    const g1 = await groups.create(a.id, GID, { title: 'Sunday run' });
    const g2 = await groups.create(a.id, GID, { title: 'Sunday run' });
    expect(g2.id).toBe(g1.id);
    expect(g2.code).toBe(g1.code);
    const parts = await prisma.groupRideParticipant.findMany({ where: { groupRideId: GID } });
    expect(parts).toHaveLength(1);
    expect(parts[0].role).toBe('LEADER');
    await expect(groups.create(b.id, GID, { title: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(groups.create(a.id, 'group-ride-0002', { title: '  ' })).rejects.toMatchObject({ status: 400 });
    await expect(groups.create(a.id, 'group-ride-0003', { title: 't', destinationLat: 1 })).rejects.toMatchObject({ status: 400 });
  });

  test('join by code: idempotent, capacity enforced, rejoin after leaving', async () => {
    const g = await groups.create(a.id, GID, { title: 'Run', maxParticipants: 2 });
    await groups.join(b.id, g.code.toLowerCase());
    await groups.join(b.id, g.code); // again, harmless
    expect(await prisma.groupRideParticipant.count({ where: { groupRideId: GID } })).toBe(2);
    await expect(groups.join(c.id, g.code)).rejects.toMatchObject({ status: 409 });
    await expect(groups.join(c.id, 'NOPE00')).rejects.toMatchObject({ status: 404 });

    await groups.leave(b.id, GID);
    await groups.join(c.id, g.code); // the freed seat
    await expect(groups.join(b.id, g.code)).rejects.toMatchObject({ status: 409 }); // full again
  });

  test('only the leader starts and ends; start is idempotent and rides need a running group', async () => {
    const g = await groups.create(a.id, GID, { title: 'Run' });
    await groups.join(b.id, g.code);
    await expect(groups.start(b.id, GID)).rejects.toMatchObject({ status: 403 });
    await expect(groups.startRide(b.id, GID, 'ride-b-0001', { startedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 409 });

    const s1 = await groups.start(a.id, GID);
    const s2 = await groups.start(a.id, GID);
    expect(s1.status).toBe('ACTIVE');
    expect(s2.startedAt.getTime()).toBe(s1.startedAt.getTime());
    await expect(groups.startRide(c.id, GID, 'ride-c-0001', { startedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 403 });
  });

  test('riders own ordinary rides; ending finalizes open ones; summary aggregates exactly', async () => {
    const g = await groups.create(a.id, GID, { title: 'Run' });
    await groups.join(b.id, g.code);
    await groups.start(a.id, GID);

    const t0 = Date.now() - 3600e3;
    const iso = new Date(t0).toISOString();
    await groups.startRide(a.id, GID, 'ride-a-0001', { startedAt: iso });
    await groups.startRide(a.id, GID, 'ride-a-0001', { startedAt: iso }); // retry
    await groups.startRide(b.id, GID, 'ride-b-0001', { startedAt: iso });
    await rides.addPoints(a.id, 'ride-a-0001', trace(t0, 15, 600));
    await rides.addPoints(b.id, 'ride-b-0001', trace(t0, 10, 300));

    // Solo endpoint cannot claim a group, and a ride cannot be moved between groups.
    await rides.upsertRide(c.id, 'ride-c-solo1', { startedAt: iso });
    expect((await prisma.ride.findUnique({ where: { id: 'ride-c-solo1' } })).groupRideId).toBeNull();
    await expect(groups.startRide(a.id, GID, 'ride-c-solo1', { startedAt: iso })).rejects.toMatchObject({ status: 403 });

    // Ada finishes herself; Bo's phone dies, so the leader ending the group finalizes Bo's ride.
    await rides.finalize(a.id, 'ride-a-0001');
    const ended = await groups.end(a.id, GID);
    expect(ended.groupRide.status).toBe('ENDED');
    expect(ended.finalizedRides).toBe(1);
    expect((await groups.end(a.id, GID)).finalizedRides).toBe(0); // idempotent

    const sum = await groups.summary(b.id, GID);
    expect(sum.riderCount).toBe(2);
    expect(sum.crewXp).toBeGreaterThan(0);
    expect(sum.riders.map((r) => r.userId)).toEqual([a.id, b.id]);
    expect(sum.riders[0].rank).toBe(1);
    expect(sum.totalDistanceM).toBeCloseTo(sum.riders[0].distanceM + sum.riders[1].distanceM, 5);
    expect(sum.topSpeedMps).toBeCloseTo(sum.riders[0].topSpeedMps, 5);

    // The group ride and solo stats agree: each rider's totals include their ride once.
    const statsA = await prisma.userStats.findUnique({ where: { userId: a.id } });
    expect(statsA.rides).toBe(1);
    expect(statsA.distanceM).toBeCloseTo(sum.riders[0].distanceM, 5);

    // Late points from Bo's recovered phone re-finalize his own ride, and the summary follows.
    await rides.addPoints(b.id, 'ride-b-0001', trace(t0, 10, 300).map((p) => ({ ...p, seq: p.seq + 1000, lng: p.lng + 0.01, t: new Date(Date.parse(p.t) + 400e3).toISOString() })));
    const after = await groups.summary(a.id, GID);
    expect(after.totalDistanceM).toBeGreaterThanOrEqual(sum.totalDistanceM);

    // Outsiders cannot read it.
    await expect(groups.summary(c.id, GID)).rejects.toMatchObject({ status: 403 });
    await expect(groups.get(c.id, GID)).rejects.toMatchObject({ status: 403 });
  });

  test('leader leaving passes leadership on; last rider leaving cancels', async () => {
    const g = await groups.create(a.id, GID, { title: 'Run' });
    await groups.join(b.id, g.code);
    const after = await groups.leave(a.id, GID);
    expect(after.leaderId).toBe(b.id);
    expect((await prisma.groupRideParticipant.findUnique({ where: { groupRideId_userId: { groupRideId: GID, userId: b.id } } })).role).toBe('LEADER');
    expect(await groups.isActiveParticipant(a.id, GID)).toBe(false);
    expect(await groups.isActiveParticipant(b.id, GID)).toBe(true);

    const last = await groups.leave(b.id, GID);
    expect(last.status).toBe('CANCELLED');
    await expect(groups.join(c.id, g.code)).rejects.toMatchObject({ status: 409 });
  });

  test('list shows only my group rides, newest first, with a cursor', async () => {
    await groups.create(a.id, 'group-ride-0010', { title: 'one' });
    await new Promise((r) => setTimeout(r, 5));
    await groups.create(a.id, 'group-ride-0011', { title: 'two' });
    await groups.create(b.id, 'group-ride-0012', { title: 'not mine' });
    const page1 = await groups.list(a.id, { limit: 1 });
    expect(page1.items.map((i) => i.id)).toEqual(['group-ride-0011']);
    const page2 = await groups.list(a.id, { limit: 1, cursor: page1.nextCursor });
    expect(page2.items.map((i) => i.id)).toEqual(['group-ride-0010']);
    expect(page2.nextCursor).toBeNull();
  });
});
