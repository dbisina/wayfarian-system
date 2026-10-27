import { describe, expect, test } from 'vitest';
import { bearingDeg, regionAt, zoomToDelta } from '../mapCamera';

describe('regionAt', () => {
  test('street level is a small span, and each zoom level halves it', () => {
    expect(zoomToDelta(16)).toBeCloseTo(0.01, 6);
    expect(zoomToDelta(15)).toBeCloseTo(0.02, 6);
    expect(zoomToDelta(14)).toBeCloseTo(0.04, 6);
  });

  test('is centred on the point and far tighter than a whole country', () => {
    const r = regionAt(6.45, 3.4, 16);
    expect(r).toMatchObject({ latitude: 6.45, longitude: 3.4 });
    expect(r.latitudeDelta).toBeLessThan(0.05);
  });
});

describe('bearingDeg', () => {
  const a = { latitude: 6.5, longitude: 3.4 };
  test('north, east, south and west', () => {
    expect(bearingDeg(a, { latitude: 6.6, longitude: 3.4 })).toBeCloseTo(0, 3);
    expect(bearingDeg(a, { latitude: 6.5, longitude: 3.5 })).toBeCloseTo(90, 1);
    expect(bearingDeg(a, { latitude: 6.4, longitude: 3.4 })).toBeCloseTo(180, 3);
    expect(bearingDeg(a, { latitude: 6.5, longitude: 3.3 })).toBeCloseTo(270, 1);
  });
});
