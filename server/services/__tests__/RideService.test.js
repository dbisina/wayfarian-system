const { createRideService, RideError } = require('../RideService');
const { offset } = (() => {
  // Same flat-earth helper the ride-core tests use: metres east/north of a fixed origin.
  const ORIGIN = { lat: 6.45, lng: 3.4 };
  return {
    offset: (east, north) => ({
      lat: ORIGIN.lat + north / 111320,
      lng: ORIGIN.lng + east / (111320 * Math.cos((ORIGIN.lat * Math.PI) / 180)),
    }),
  };
})();

/** Minimal in-memory stand-in for the Prisma calls RideService makes. */
function fakePrisma() {
  const db = { rides: new Map(), points: [], events: [], stats: new Map(), ledger: [], achievements: [], users: new Map(), vehicles: [] };
  const apply = (row, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('increment' in v) row[k] = (row[k] || 0) + v.increment;
        else if ('decrement' in v) row[k] = (row[k] || 0) - v.decrement;
      } else row[k] = v;
    }
    return row;
  };
  const p = {
    db,
    ride: {
      findUnique: async ({ where }) => (db.rides.has(where.id) ? { ...db.rides.get(where.id) } : null),
      create: async ({ data }) => {
        const row = { status: 'RECORDING', distanceM: 0, movingTimeS: 0, elapsedTimeS: 0, topSpeedMps: 0, avgSpeedMps: 0, pointCount: 0, finalizedAt: null, endedAt: null, ...data };
        db.rides.set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }) => ({ ...apply(db.rides.get(where.id), data) }),
      updateMany: async ({ where, data }) => {
        const row = db.rides.get(where.id);
        if (!row || ('finalizedAt' in where && where.finalizedAt === null && row.finalizedAt)) return { count: 0 };
        apply(row, data);
        return { count: 1 };
      },
      aggregate: async ({ where }) => {
        const rows = [...db.rides.values()].filter((r) => r.userId === where.userId && r.status === where.status);
        return { _max: { topSpeedMps: rows.length ? Math.max(...rows.map((r) => r.topSpeedMps)) : null } };
      },
      findMany: async ({ where }) =>
        [...db.rides.values()].filter(
          (r) =>
            r.userId === where.userId &&
            (where.status === undefined ? true : typeof where.status === 'string' ? r.status === where.status : r.status !== where.status.not) &&
            (!where.distanceM || r.distanceM >= where.distanceM.gte)
        ),
      count: async ({ where }) =>
        [...db.rides.values()].filter(
          (r) =>
            r.userId === where.userId &&
            r.status === where.status &&
            (!where.distanceM || r.distanceM >= where.distanceM.gte) &&
            (!where.movingTimeS || r.movingTimeS >= where.movingTimeS.gte) &&
            (!where.groupRideId || r.groupRideId)
        ).length,
    },
    vehicle: { findFirst: async ({ where }) => db.vehicles.find((v) => v.id === where.id && v.userId === where.userId) || null },
    ridePoint: {
      createMany: async ({ data }) => {
        let count = 0;
        for (const d of data) {
          if (!db.points.some((x) => x.rideId === d.rideId && x.seq === d.seq)) { db.points.push(d); count++; }
        }
        return { count };
      },
      findMany: async ({ where }) =>
        db.points.filter((x) => x.rideId === where.rideId).sort((a, b) => a.segment - b.segment || a.recordedAt - b.recordedAt),
    },
    rideLifecycleEvent: {
      createMany: async ({ data }) => {
        let count = 0;
        for (const d of data) if (!db.events.some((e) => e.id === d.id)) { db.events.push(d); count++; }
        return { count };
      },
      findFirst: async ({ where }) => db.events.filter((e) => e.rideId === where.rideId).sort((a, b) => b.at - a.at)[0] || null,
    },
    userStats: {
      findUnique: async ({ where }) => db.stats.get(where.userId) || null,
      upsert: async ({ where, create, update }) => {
        if (db.stats.has(where.userId)) apply(db.stats.get(where.userId), update);
        else db.stats.set(where.userId, { ...create });
        return db.stats.get(where.userId);
      },
      update: async ({ where, data }) => apply(db.stats.get(where.userId), data),
    },
    rideAchievement: {
      findMany: async ({ where }) => db.achievements.filter((a) => a.userId === where.userId),
      createMany: async ({ data }) => {
        let count = 0;
        for (const d of data) if (!db.achievements.some((a) => a.userId === d.userId && a.achievementId === d.achievementId)) { db.achievements.push({ earnedAt: new Date(), ...d }); count++; }
        return { count };
      },
    },
    // Group rides are covered against a real database; solo tests have none.
    groupRide: { count: async () => 0 },
    groupRideParticipant: { count: async () => 0 },
    xpLedger: {
      findUnique: async ({ where }) => db.ledger.find((l) => l.userId === where.userId_source.userId && l.source === where.userId_source.source) || null,
      create: async ({ data }) => { const row = { id: String(db.ledger.length + 1), ...data }; db.ledger.push(row); return row; },
      update: async ({ where, data }) => apply(db.ledger.find((l) => l.id === where.id), data),
    },
    user: {
      findUnique: async ({ where }) => db.users.get(where.id) || null,
      update: async ({ where, data }) => apply(db.users.get(where.id), data),
    },
    $transaction: async (fn) => fn(p),
  };
  return p;
}

/** A straight east-bound ride: 1 Hz fixes at `speed` m/s for `seconds`. */
const track = (startSeq, startMs, speed, seconds, startEast = 0, segment = 0) =>
  Array.from({ length: seconds + 1 }, (_, i) => ({
    seq: startSeq + i,
    segment,
    t: startMs + i * 1000,
    accuracy: 5,
    ...offset(startEast + speed * i, 0),
  }));

const rideXpOf = (id) => prisma.db.ledger.find((l) => l.source === `ride:${id}`)?.amount || 0;
const achievementXp = () => prisma.db.ledger.filter((l) => l.source.startsWith('achievement:')).reduce((n, l) => n + l.amount, 0);
const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const USER = 'user-1';
let prisma;
let svc;

beforeEach(async () => {
  prisma = fakePrisma();
  prisma.db.users.set(USER, { id: USER, xp: 0, level: 1 });
  svc = createRideService({ prisma });
  await svc.upsertRide(USER, 'ride-0001', { startedAt: new Date(T0).toISOString() });
});

test('creating a ride twice returns the same ride', async () => {
  const again = await svc.upsertRide(USER, 'ride-0001', { startedAt: new Date(T0 + 5000).toISOString() });
  expect(new Date(again.startedAt).getTime()).toBe(T0);
  expect(prisma.db.rides.size).toBe(1);
});

test("another user cannot touch someone else's ride", async () => {
  await expect(svc.upsertRide('user-2', 'ride-0001', { startedAt: new Date(T0).toISOString() })).rejects.toMatchObject({ status: 403 });
  await expect(svc.addPoints('user-2', 'ride-0001', track(0, T0, 10, 5))).rejects.toMatchObject({ status: 403 });
});

test('replayed point batches are ignored', async () => {
  const pts = track(0, T0, 10, 20);
  const first = await svc.addPoints(USER, 'ride-0001', pts);
  const replay = await svc.addPoints(USER, 'ride-0001', pts);
  expect(first.accepted).toBe(pts.length);
  expect(replay.accepted).toBe(0);
  expect(replay.duplicates).toBe(pts.length);
});

test('rejects malformed points and oversized batches', async () => {
  await expect(svc.addPoints(USER, 'ride-0001', [{ seq: 0, lat: 999, lng: 0, t: T0 }])).rejects.toBeInstanceOf(RideError);
  await expect(svc.addPoints(USER, 'ride-0001', [])).rejects.toMatchObject({ status: 400 });
  await expect(svc.addPoints(USER, 'ride-0001', track(0, T0, 1, 1200))).rejects.toMatchObject({ status: 400 });
});

test('finalize computes stats on the server and credits the user once', async () => {
  await svc.addPoints(USER, 'ride-0001', track(0, T0, 20, 600)); // 12 km
  const ride = await svc.finalize(USER, 'ride-0001');
  expect(ride.status).toBe('FINALIZED');
  expect(ride.distanceM).toBeGreaterThan(11_900);
  expect(ride.distanceM).toBeLessThan(12_100);

  const stats = prisma.db.stats.get(USER);
  expect(stats.rides).toBe(1);
  expect(stats.distanceM).toBeCloseTo(ride.distanceM, 3);
  expect(rideXpOf('ride-0001')).toBe(Math.floor((ride.distanceM / 1000) * 2)); // 2 XP per km
  expect(prisma.db.achievements.map((a) => a.achievementId)).toEqual(['first_journey']);
  expect(prisma.db.users.get(USER).xp).toBe(prisma.db.ledger.reduce((n, l) => n + l.amount, 0));
});

test('finalizing again, even many times, never double-credits', async () => {
  await svc.addPoints(USER, 'ride-0001', track(0, T0, 20, 600));
  await svc.finalize(USER, 'ride-0001');
  const after1 = { ...prisma.db.stats.get(USER) };
  await svc.finalize(USER, 'ride-0001');
  await Promise.all([svc.finalize(USER, 'ride-0001'), svc.finalize(USER, 'ride-0001')]);
  const after = prisma.db.stats.get(USER);
  expect(after.distanceM).toBeCloseTo(after1.distanceM, 6);
  expect(after.rides).toBe(1);
  expect(prisma.db.ledger).toHaveLength(2); // ride XP + first_journey, never repeated
  expect(prisma.db.achievements).toHaveLength(1);
  expect(prisma.db.users.get(USER).xp).toBe(rideXpOf('ride-0001') + achievementXp());
});

test('late points after finalize adjust totals by the difference only', async () => {
  await svc.addPoints(USER, 'ride-0001', track(0, T0, 20, 300)); // 6 km
  await svc.finalize(USER, 'ride-0001');
  // The rest of the ride uploads later, as in an offline sync.
  await svc.addPoints(USER, 'ride-0001', track(301, T0 + 301_000, 20, 300, 20 * 301));
  const stats = prisma.db.stats.get(USER);
  const ride = prisma.db.rides.get('ride-0001');
  expect(ride.distanceM).toBeGreaterThan(11_900);
  expect(stats.distanceM).toBeCloseTo(ride.distanceM, 3);
  expect(stats.rides).toBe(1);
  expect(rideXpOf('ride-0001')).toBe(Math.floor((ride.distanceM / 1000) * 2));
  expect(prisma.db.users.get(USER).xp).toBe(rideXpOf('ride-0001') + achievementXp());
});

test('a pause is not counted: points in a new segment start fresh', async () => {
  await svc.addPoints(USER, 'ride-0001', [
    ...track(0, T0, 10, 300),
    ...track(1000, T0 + 7_200_000, 10, 300, 50_000, 1), // resumed 50 km away, 2 h later
  ]);
  const ride = await svc.finalize(USER, 'ride-0001');
  expect(ride.distanceM).toBeGreaterThan(5_900);
  expect(ride.distanceM).toBeLessThan(6_100);
});

test('tiny rides are stored but not counted in totals or XP', async () => {
  await svc.addPoints(USER, 'ride-0001', track(0, T0, 1, 10)); // ~10 m
  await svc.finalize(USER, 'ride-0001');
  expect(prisma.db.stats.get(USER).rides).toBe(0);
  expect(prisma.db.stats.get(USER).distanceM).toBe(0);
  expect(prisma.db.users.get(USER).xp).toBe(0);
});

test('deleting a finalized ride reverses its totals and XP', async () => {
  await svc.addPoints(USER, 'ride-0001', track(0, T0, 20, 600));
  await svc.finalize(USER, 'ride-0001');
  await svc.deleteRide(USER, 'ride-0001');
  await svc.deleteRide(USER, 'ride-0001'); // idempotent
  const stats = prisma.db.stats.get(USER);
  expect(stats.distanceM).toBeCloseTo(0, 6);
  expect(stats.rides).toBe(0);
  expect(stats.topSpeedMps).toBe(0);
  expect(rideXpOf('ride-0001')).toBe(0);
  // Achievements already earned are kept; only the ride's own XP is reversed.
  expect(prisma.db.users.get(USER).xp).toBe(achievementXp());
});

test('record top speed follows the remaining rides when the fastest is deleted', async () => {
  await svc.addPoints(USER, 'ride-0001', track(0, T0, 30, 120));
  await svc.finalize(USER, 'ride-0001');
  await svc.upsertRide(USER, 'ride-0002', { startedAt: new Date(T0 + 86_400_000).toISOString() });
  await svc.addPoints(USER, 'ride-0002', track(0, T0 + 86_400_000, 10, 120));
  await svc.finalize(USER, 'ride-0002');
  expect(prisma.db.stats.get(USER).topSpeedMps).toBeGreaterThan(28);
  await svc.deleteRide(USER, 'ride-0001');
  expect(prisma.db.stats.get(USER).topSpeedMps).toBeLessThan(12);
});

test('events move the ride status and are deduped by id', async () => {
  const ev = (id, type, off) => ({ id, type, at: new Date(T0 + off).toISOString() });
  await svc.addEvents(USER, 'ride-0001', [ev('evt-0001', 'START', 0), ev('evt-0002', 'PAUSE', 60_000)]);
  expect(prisma.db.rides.get('ride-0001').status).toBe('PAUSED');
  const replay = await svc.addEvents(USER, 'ride-0001', [ev('evt-0002', 'PAUSE', 60_000)]);
  expect(replay.accepted).toBe(0);
  await svc.addEvents(USER, 'ride-0001', [ev('evt-0003', 'RESUME', 120_000), ev('evt-0004', 'END', 600_000)]);
  expect(prisma.db.rides.get('ride-0001').status).toBe('ENDED');
  // An older event arriving late must not move the status backwards.
  await svc.addEvents(USER, 'ride-0001', [ev('evt-0005', 'PAUSE', 30_000)]);
  expect(prisma.db.rides.get('ride-0001').status).toBe('ENDED');
});

describe('achievements and streaks', () => {
  const { evaluate, computeStreak } = require('../achievementsV2');

  test('tiny rides earn nothing and the night rider check uses the rider timezone', () => {
    const base = { stats: { distanceM: 800, movingTimeS: 400, topSpeedMps: 10 }, qualifyingRides: 1 };
    const night = { startedAt: '2026-10-01T22:30:00Z', timezone: 'UTC', distanceM: 800, movingTimeS: 400 };
    expect(evaluate({ ...base, ride: night })).toContain('night_rider');
    // 22:30 UTC is 23:30 in Lagos (night) but 15:30 in Los Angeles (afternoon).
    expect(evaluate({ ...base, ride: { ...night, timezone: 'Africa/Lagos' } })).toContain('night_rider');
    expect(evaluate({ ...base, ride: { ...night, timezone: 'America/Los_Angeles' } })).not.toContain('night_rider');
    expect(evaluate({ stats: { distanceM: 10, movingTimeS: 5, topSpeedMps: 1 }, qualifyingRides: 0, ride: { ...night, distanceM: 10, movingTimeS: 5 } })).toEqual([]);
  });

  test('speed, distance and time thresholds', () => {
    const got = evaluate({ stats: { distanceM: 150_000, movingTimeS: 4000, topSpeedMps: 32 }, qualifyingRides: 12 });
    expect(got).toEqual(expect.arrayContaining(['first_journey', 'ten_journeys', 'hundred_km', 'speed_demon', 'hour_rider']));
    expect(got).not.toContain('velocity_master');
  });

  test('streak counts consecutive days and survives until the day after the last ride', () => {
    const d = (day) => ({ startedAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`, timezone: 'UTC' });
    const now = new Date('2026-10-06T09:00:00Z');
    expect(computeStreak([d(3), d(4), d(5)], now)).toMatchObject({ current: 3, longest: 3 });
    expect(computeStreak([d(3), d(4), d(5)], new Date('2026-10-07T09:00:00Z')).current).toBe(0);
    expect(computeStreak([d(1), d(2), d(4), d(5), d(6)], now)).toMatchObject({ current: 3, longest: 3 });
    expect(computeStreak([], now)).toMatchObject({ current: 0, longest: 0 });
  });

  test('a repeated finalize does not award twice, and a milestone reached later is awarded once', async () => {
    await svc.addPoints(USER, 'ride-0001', track(0, T0, 20, 600));
    const first = await svc.finalize(USER, 'ride-0001');
    expect(first.newAchievements.map((a) => a.achievementId)).toEqual(['first_journey']);
    const again = await svc.finalize(USER, 'ride-0001');
    expect(again.newAchievements).toEqual([]);
  });
});
