// Real-database checks for rider profiles, vehicle stats, the service tracker, ride XP info,
// badge progress and the group achievements. Skipped unless TEST_DATABASE_URL is set.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('profiles, vehicles, XP info and group badges (real database)', () => {
  let prisma, rides, groups, profiles, a, b;
  const lng = (m) => 3.4 + m / (111320 * Math.cos((6.45 * Math.PI) / 180));
  const trail = (startMs, speed, seconds) =>
    Array.from({ length: seconds + 1 }, (_, i) => ({ seq: i, segment: 0, lat: 6.45, lng: lng(speed * i), t: new Date(startMs + i * 1000).toISOString(), accuracy: 5 }));
  const ride = async (user, id, opts = {}) => {
    const t0 = Date.now() - 3600e3;
    await rides.upsertRide(user.id, id, { startedAt: new Date(t0).toISOString(), vehicleId: opts.vehicleId }, { groupRideId: opts.groupRideId });
    const pts = trail(t0, opts.speed || 12, opts.seconds || 600);
    for (let i = 0; i < pts.length; i += 500) await rides.addPoints(user.id, id, pts.slice(i, i + 500));
    return rides.finalize(user.id, id);
  };

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const { createRideService } = require('../RideService');
    const { createGroupRideService } = require('../GroupRideService');
    const { createProfileServices } = require('../ProfileServicesV2');
    rides = createRideService({ prisma });
    groups = createGroupRideService({ prisma, rideService: rides });
    profiles = createProfileServices({ prisma, rideService: rides });
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "users" CASCADE');
    a = await prisma.user.create({ data: { firebaseUid: 'pa', displayName: 'Ada' } });
    b = await prisma.user.create({ data: { firebaseUid: 'pb', displayName: 'Bo' } });
  });

  test('a ride reports the XP and badges it earned, and a level-up only on the newest ride', async () => {
    const first = await ride(a, 'ride-xp-000001', { speed: 15, seconds: 1200 });
    const info = await rides.getRide(a.id, 'ride-xp-000001');
    const badgeXp = first.newAchievements.reduce((n, x) => n + x.xpAwarded, 0);
    expect(info.xpEarned).toBe(badgeXp + Math.floor((info.distanceM / 1000) * 2));
    expect(info.achievements.map((x) => x.achievementId)).toContain('first_journey');

    // pretend this ride took the rider from level 1 to level 6
    await prisma.rideAchievement.deleteMany({ where: { userId: a.id } });
    await prisma.xpLedger.deleteMany({ where: { userId: a.id } });
    await prisma.xpLedger.create({ data: { userId: a.id, source: 'ride:ride-xp-000001', amount: 5000 } });
    await prisma.user.update({ where: { id: a.id }, data: { xp: 5000, level: 6 } });
    const lv = await rides.getRide(a.id, 'ride-xp-000001');
    expect(lv.levelUp).toMatchObject({ to: 6 });
    expect(lv.levelUp.from).toBeLessThan(6);

    await ride(a, 'ride-xp-000002', { speed: 10, seconds: 100 });
    expect((await rides.getRide(a.id, 'ride-xp-000001')).levelUp).toBeNull(); // not the newest any more
  });

  test('summary shows progress toward every badge', async () => {
    await ride(a, 'ride-badge-0001', { speed: 40, seconds: 900 });
    const s = await rides.getSummary(a.id);
    const byId = Object.fromEntries(s.badgeProgress.map((p) => [p.id, p]));
    expect(byId.first_journey).toMatchObject({ earned: true, pct: 100 });
    expect(byId.speed_demon.earned).toBe(true); // 40 m/s = 144 km/h
    expect(byId.apex_controller.earned).toBe(false);
    expect(byId.apex_controller.pct).toBeGreaterThan(50);
    expect(byId.apex_controller.pct).toBeLessThan(100);
    expect(byId.hundred_journeys.pct).toBeLessThan(5);
  });

  test('leading a group ride earns Road Captain; five riders earn Convoy', async () => {
    const extra = [];
    for (let i = 0; i < 4; i++) extra.push(await prisma.user.create({ data: { firebaseUid: 'cv' + i, displayName: 'R' + i } }));
    const g = await groups.create(a.id, 'convoy-ride-0001', { title: 'Big one' });
    for (const u of [b, ...extra]) await groups.join(u.id, g.code);
    await groups.start(a.id, 'convoy-ride-0001');
    const t0 = Date.now() - 3600e3;
    await groups.startRide(a.id, 'convoy-ride-0001', 'lead-ride-00001', { startedAt: new Date(t0).toISOString() });
    await rides.addPoints(a.id, 'lead-ride-00001', trail(t0, 12, 600));
    await groups.end(a.id, 'convoy-ride-0001');

    const earned = (await prisma.rideAchievement.findMany({ where: { userId: a.id } })).map((x) => x.achievementId);
    expect(earned).toEqual(expect.arrayContaining(['road_captain', 'convoy', 'ace_of_friends']));
    const other = (await prisma.rideAchievement.findMany({ where: { userId: b.id } })).map((x) => x.achievementId);
    expect(other).not.toContain('road_captain');
  });

  test('rider profile shares aggregates and the viewer numbers, never routes', async () => {
    await ride(a, 'ride-prof-000001', { speed: 20, seconds: 1200 });
    await ride(b, 'ride-prof-000002', { speed: 10, seconds: 600 });
    const p = await profiles.getRider(b.id, a.id);
    expect(p).toMatchObject({ id: a.id, displayName: 'Ada', isSelf: false });
    expect(p.stats.rides).toBe(1);
    expect(p.you.rides).toBe(1);
    expect(p.stats.distanceM).toBeGreaterThan(p.you.distanceM);
    expect(JSON.stringify(p)).not.toMatch(/"lat"|"lng"|routePoints/);
    await expect(profiles.getRider(b.id, 'nobody')).rejects.toMatchObject({ status: 404 });
  });

  test('the friends board only has riders who shared a group ride with you', async () => {
    const { createLeaderboardService } = require('../LeaderboardServiceV2');
    const lb = createLeaderboardService({ prisma });
    const stranger = await prisma.user.create({ data: { firebaseUid: 'pz', displayName: 'Zed' } });
    await ride(a, 'ride-fr-0000001', { speed: 10, seconds: 600 });
    await ride(b, 'ride-fr-0000002', { speed: 12, seconds: 600 });
    await ride(stranger, 'ride-fr-0000003', { speed: 30, seconds: 600 }); // the fastest overall
    const g = await groups.create(a.id, 'friends-ride-001', { title: 'Mates' });
    await groups.join(b.id, g.code);

    const mine = await groups.coRiders(a.id);
    expect([...mine].sort()).toEqual([a.id, b.id].sort());
    const friends = await lb.topAmong(mine, { metric: 'distance', period: 'allTime' });
    expect(friends.items.map((i) => i.userId)).toEqual([b.id, a.id]);
    expect(friends.items.map((i) => i.rank)).toEqual([1, 2]);
    const everyone = await lb.top({ metric: 'distance', period: 'allTime' });
    expect(everyone.items[0].userId).toBe(stranger.id);
    const week = await lb.topAmong(mine, { metric: 'distance', period: 'week' });
    expect(week.items).toHaveLength(2);
    expect(await lb.topAmong([], {})).toMatchObject({ items: [] });
  });

  test('vehicle stats and the service countdown follow the rides', async () => {
    const v = await prisma.vehicle.create({ data: { userId: a.id, name: 'Bluebird', make: 'BMW', model: 'R 1250 RT' } });
    await ride(a, 'ride-veh-0000001', { vehicleId: v.id, speed: 20, seconds: 1200 }); // about 24 km
    let veh = await profiles.getVehicle(a.id, v.id);
    expect(veh.rides).toBe(1);
    expect(veh.riddenM).toBeGreaterThan(23000);
    expect(veh.service.toGoKm).toBeCloseTo(2500 - veh.riddenM / 1000, 0);
    expect(veh.service.last).toBeNull();

    const s1 = await profiles.logService(a.id, v.id, 'service-log-0001', { kind: 'oil', intervalKm: 5000 });
    const s2 = await profiles.logService(a.id, v.id, 'service-log-0001', { kind: 'oil', intervalKm: 5000 });
    expect(s2.id).toBe(s1.id);
    expect(await prisma.vehicleServiceLog.count()).toBe(1);
    veh = await profiles.getVehicle(a.id, v.id);
    expect(veh.service).toMatchObject({ intervalKm: 5000, pct: 0, due: false });
    expect(veh.service.last.kind).toBe('oil');
    expect(veh.service.toGoKm).toBeCloseTo(5000, 0);

    await expect(profiles.getVehicle(b.id, v.id)).rejects.toMatchObject({ status: 403 });
    await expect(profiles.logService(a.id, v.id, 'service-log-0002', { kind: 'bogus' })).rejects.toMatchObject({ status: 400 });
    await expect(profiles.logService(a.id, v.id, 'service-log-0003', { intervalKm: 5 })).rejects.toMatchObject({ status: 400 });
  });
});
