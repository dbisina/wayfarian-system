import { describe, expect, test, vi } from 'vitest';

// Both pull in React Native modules that can't load under Node.
vi.mock('../../services/api', () => ({ placesAPI: {} }));
vi.mock('../../services/directions', () => ({ decodePolyline: () => [] }));

import { haversineM, locateOnRoute, remainingRouteM, travelModeFor } from '../navigation';

// A straight east-west road on the equator, ~1.11 km per 0.01°.
const road = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0.01 },
  { latitude: 0, longitude: 0.02 },
];

describe('travelModeFor', () => {
  test('a motorcycle gets motorcycle routes, not bicycle ones', () => {
    expect(travelModeFor('motorcycle')).toBe('motorcycle');
    expect(travelModeFor('Scooter')).toBe('motorcycle');
  });
  test('bikes, walking and cars', () => {
    expect(travelModeFor('bicycle')).toBe('bicycling');
    expect(travelModeFor('bike')).toBe('bicycling');
    expect(travelModeFor('walking')).toBe('walking');
    expect(travelModeFor('car')).toBe('driving');
    expect(travelModeFor(undefined)).toBe('driving');
  });
});

describe('locateOnRoute', () => {
  test('measures to the road line, not just its corners', () => {
    // Midway between two vertices, 50 m north of the road: ~556 m from either vertex.
    const pos = { latitude: 50 / 110540, longitude: 0.005 };
    const at = locateOnRoute(pos, road);
    expect(at.offRouteM).toBeGreaterThan(45);
    expect(at.offRouteM).toBeLessThan(55);
    expect(at.segment).toBe(0);
    expect(at.t).toBeCloseTo(0.5, 2);
  });
});

describe('remainingRouteM', () => {
  test('is the road distance left, from partway along a segment', () => {
    const at = locateOnRoute({ latitude: 0, longitude: 0.005 }, road);
    const total = haversineM(road[0], road[2]);
    expect(remainingRouteM(at, road)).toBeCloseTo(total * 0.75, 0);
  });
  test('is zero at the end', () => {
    const at = locateOnRoute(road[2], road);
    expect(remainingRouteM(at, road)).toBeCloseTo(0, 0);
  });
});
