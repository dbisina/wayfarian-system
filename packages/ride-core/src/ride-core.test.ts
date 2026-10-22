import { describe, expect, test } from 'vitest';
import { StatsAccumulator, computeRideStats, mpsToKmh } from './index';
import { concat, offset, straight, stationary } from './testing/traces';

const near = (actual: number, expected: number, tolPct: number) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(tolPct / 100);

describe('clean motion', () => {
  test('constant speed gives the exact distance, moving time, top and average speed', () => {
    const s = computeRideStats([straight(20, 600)]);
    near(s.distanceM, 12_000, 0.5);
    near(s.movingTimeS, 600, 1);
    near(s.topSpeedMps, 20, 2);
    near(s.avgSpeedMps, 20, 1);
    expect(mpsToKmh(s.avgSpeedMps)).toBeCloseTo(72, 0);
  });

  test('modest GPS noise does not inflate distance much', () => {
    const s = computeRideStats([straight(20, 600, { noiseM: 2, accuracy: 6, seed: 7 })]);
    near(s.distanceM, 12_000, 3);
  });
});

describe('standing still', () => {
  test('a wandering fix at a red light adds no distance or moving time', () => {
    const s = computeRideStats([stationary(600, { noiseM: 2.5, accuracy: 10, seed: 3 })]);
    expect(s.distanceM).toBeLessThan(50);
    expect(s.movingTimeS).toBeLessThan(30);
    expect(s.elapsedTimeS).toBeGreaterThan(590);
  });

  test('stop and go: moving time excludes the stop, elapsed includes it', () => {
    const a = straight(15, 300, { seed: 1 });
    const stop = stationary(180, { startT: 300_000, startEastM: 15 * 300, noiseM: 2, accuracy: 8, seed: 2 });
    const b = straight(15, 300, { startT: 480_000, startEastM: 15 * 300, seed: 3 });
    const s = computeRideStats([concat(a, stop.slice(1), b.slice(1))]);
    near(s.distanceM, 9_000, 2);
    near(s.movingTimeS, 600, 3);
    near(s.elapsedTimeS, 780, 1);
    // Average is over moving time, so a stop does not drag it down.
    near(s.avgSpeedMps, 15, 3);
  });
});

describe('pauses', () => {
  test('nothing is counted between segments, however far the rider moved while paused', () => {
    const first = straight(10, 300, { seed: 1 });
    const second = straight(10, 300, { startT: 3_600_000, startEastM: 20_000, seed: 2 });
    const s = computeRideStats([first, second]);
    near(s.distanceM, 6_000, 1);
    near(s.elapsedTimeS, 600, 1);
  });

  test('top speed survives a resume', () => {
    const fast = straight(30, 120, { seed: 1 });
    const slow = straight(5, 300, { startT: 1_000_000, startEastM: 5_000, seed: 2 });
    const s = computeRideStats([fast, slow]);
    near(s.topSpeedMps, 30, 3);
  });
});

describe('bad data', () => {
  test('a single GPS jump is ignored', () => {
    const t = straight(15, 300, { seed: 1 });
    const mid = Math.floor(t.length / 2);
    t[mid] = { ...t[mid]!, ...offset(15 * 150 + 5_000, 0) };
    const s = computeRideStats([t]);
    near(s.distanceM, 4_500, 1);
    expect(s.pointsRejected).toBeGreaterThanOrEqual(1);
    expect(s.topSpeedMps).toBeLessThan(20);
  });

  test('poor-accuracy fixes are ignored', () => {
    const t = straight(15, 120, { seed: 1 });
    const noisy = t.map((p, i) => (i % 10 === 5 ? { ...p, accuracy: 300, ...offset(15 * i + 400, 400) } : p));
    const s = computeRideStats([noisy]);
    near(s.distanceM, 1_800, 1);
  });

  test('duplicate and out-of-order timestamps do not change the result', () => {
    const t = straight(12, 200, { seed: 1 });
    const clean = computeRideStats([t]);
    const shuffled = [...t].reverse();
    const withDupes = [...shuffled, ...t.slice(10, 20)];
    const messy = computeRideStats([withDupes]);
    expect(messy.distanceM).toBeCloseTo(clean.distanceM, 3);
    expect(messy.movingTimeS).toBeCloseTo(clean.movingTimeS, 3);
  });

  test('invalid coordinates are rejected', () => {
    const acc = new StatsAccumulator();
    acc.add({ lat: 999, lng: 3, t: 1000 });
    acc.add({ lat: NaN, lng: 3, t: 2000 });
    expect(acc.snapshot().pointsRejected).toBe(2);
  });
});

describe('gaps', () => {
  test('a short tunnel gap still counts the distance travelled', () => {
    const before = straight(20, 100, { seed: 1 });
    const after = straight(20, 100, { startT: 140_000, startEastM: 20 * 140, seed: 2 });
    const s = computeRideStats([concat(before, after)]);
    near(s.distanceM, 20 * 240, 1);
  });

  test('a long silence is signal lost and is not guessed', () => {
    const before = straight(20, 100, { seed: 1 });
    const after = straight(20, 100, { startT: 1_000_000, startEastM: 40_000, seed: 2 });
    const s = computeRideStats([concat(before, after)]);
    near(s.distanceM, 4_000, 1);
  });
});

describe('top speed', () => {
  test('is the sustained speed, not a single lucky fix', () => {
    const t = straight(15, 300, { noiseM: 2, accuracy: 6, seed: 11 });
    const s = computeRideStats([t]);
    expect(s.topSpeedMps).toBeGreaterThan(13);
    expect(s.topSpeedMps).toBeLessThan(18);
  });

  test('a ride shorter than the window falls back to its average', () => {
    const s = computeRideStats([straight(10, 3)]);
    near(s.topSpeedMps, 10, 5);
  });

  test('never exceeds the configured plausible maximum', () => {
    const s = computeRideStats([straight(60, 60)], { maxSpeedMps: 50 });
    expect(s.topSpeedMps).toBeLessThanOrEqual(50);
  });
});

describe('live and authoritative agree', () => {
  test('feeding points one at a time equals the batch result', () => {
    const a = straight(18, 200, { noiseM: 2, accuracy: 6, seed: 5 });
    const b = straight(8, 200, { startT: 5_000_000, startEastM: 9_000, noiseM: 2, accuracy: 6, seed: 6 });
    const batch = computeRideStats([a, b]);

    const live = new StatsAccumulator();
    live.startSegment();
    a.forEach((p) => live.add(p));
    live.endSegment();
    live.startSegment();
    b.forEach((p) => live.add(p));
    const snap = live.snapshot();

    expect(snap.distanceM).toBeCloseTo(batch.distanceM, 6);
    expect(snap.movingTimeS).toBeCloseTo(batch.movingTimeS, 6);
    expect(snap.elapsedTimeS).toBeCloseTo(batch.elapsedTimeS, 6);
    expect(snap.topSpeedMps).toBeCloseTo(batch.topSpeedMps, 6);
  });
});
