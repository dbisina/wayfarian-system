const { normalizePoints, planRide, legacyTotals } = require('../backfillV2');

const lng = (m) => 3.4 + m / (111320 * Math.cos((6.45 * Math.PI) / 180));
const trail = (startMs, speedMps, seconds, shape = (p) => p) =>
  Array.from({ length: seconds + 1 }, (_, i) =>
    shape({ lat: 6.45, lng: lng(speedMps * i), timestamp: new Date(startMs + i * 1000).toISOString(), speed: speedMps * 3.6 })
  );

describe('normalizePoints', () => {
  test('accepts both legacy shapes, drops junk, sorts, removes same-instant duplicates', () => {
    const { points, dropped } = normalizePoints([
      { latitude: 6.45, longitude: 3.4, timestamp: '2026-01-01T00:00:02Z' },
      { lat: 6.45, lng: 3.4, timestamp: '2026-01-01T00:00:01Z' },
      { lat: 6.45, lng: 3.4, timestamp: '2026-01-01T00:00:01Z' },
      { lat: 999, lng: 3.4, timestamp: '2026-01-01T00:00:03Z' },
      { lat: 6.45, lng: 3.4 },
      null,
    ]);
    expect(points.map((p) => p.t)).toEqual([Date.parse('2026-01-01T00:00:01Z'), Date.parse('2026-01-01T00:00:02Z')]);
    expect(dropped).toBe(4);
  });

  test('non-arrays give nothing', () => {
    expect(normalizePoints(null).points).toEqual([]);
    expect(normalizePoints({}).points).toEqual([]);
  });
});

describe('planRide', () => {
  const row = (over) => ({ id: 'abc123', userId: 'u1', startTime: new Date('2026-01-01T00:00:00Z'), endTime: null, totalDistance: 0, totalTime: 0, topSpeed: 0, routePoints: null, ...over });

  test('a good trail is recomputed, so inflated legacy totals are corrected', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const plan = planRide('journey', row({ totalDistance: 25, totalTime: 600, topSpeed: 180, routePoints: trail(t0, 15, 600) }));
    expect(plan.mode).toBe('recomputed');
    expect(plan.rideId).toBe('lj_abc123');
    expect(plan.stats.distanceM).toBeGreaterThan(8900);
    expect(plan.stats.distanceM).toBeLessThan(9100); // not the 25 km v1 claimed
    expect(plan.stats.topSpeedMps * 3.6).toBeLessThan(60);
  });

  test('without a trail the stored totals are kept, with sane speeds', () => {
    const plan = planRide('instance', row({ id: 'inst9', totalDistance: 12, totalTime: 1800, topSpeed: 400 }));
    expect(plan.mode).toBe('legacy');
    expect(plan.rideId).toBe('li_inst9');
    expect(plan.stats.distanceM).toBe(12000);
    expect(plan.stats.topSpeedMps * 3.6).toBeCloseTo(250, 5); // capped
  });

  test('a physically impossible stored ride with no trail is skipped', () => {
    const plan = planRide('journey', row({ totalDistance: 900, totalTime: 600 }));
    expect(plan.mode).toBe('skipped');
    expect(plan.reason).toBe('implausible_speed');
  });

  test('top speed never falls below the average', () => {
    expect(legacyTotals({ totalDistance: 36, totalTime: 1800, topSpeed: 10 }).topSpeedMps).toBeGreaterThanOrEqual(20);
  });
});
