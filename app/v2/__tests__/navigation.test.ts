import { describe, expect, test, vi } from 'vitest';

// The module imports the API client at load time; only the pure helpers are under test.
vi.mock('../../services/api', () => ({ apiRequest: vi.fn() }));
vi.mock('expo-constants', () => ({ default: {} }));

import { advanceStep, distanceFromRouteM, haversineM, toNavRoute, travelModeFor, turnKind } from '../navigation';

describe('navigation helpers', () => {
  test('maneuver names from the Routes API become arrows', () => {
    expect(turnKind('TURN_LEFT')).toBe('left');
    expect(turnKind('TURN_RIGHT')).toBe('right');
    expect(turnKind('TURN_SLIGHT_LEFT')).toBe('slight-left');
    expect(turnKind('TURN_SHARP_RIGHT')).toBe('right');
    expect(turnKind('UTURN_LEFT')).toBe('uturn');
    expect(turnKind('FORK_RIGHT')).toBe('slight-right');
    expect(turnKind('RAMP_LEFT')).toBe('slight-left');
    expect(turnKind('DEPART')).toBe('straight');
    expect(turnKind(null)).toBe('straight');
  });

  test('vehicle type picks the travel mode', () => {
    expect(travelModeFor('bicycle')).toBe('bicycling');
    expect(travelModeFor('walk')).toBe('walking');
    expect(travelModeFor('car')).toBe('driving');
    expect(travelModeFor(undefined)).toBe('driving');
  });

  test('the server route becomes steps, a drawn line and totals', () => {
    // "_p~iF~ps|U_ulLnnqC_mqNvxq`@" is Google's documented example polyline
    const route = toNavRoute({
      distance: { value: 5000 }, duration: { value: 600 }, polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      steps: [
        { instruction: 'Turn left onto Adeola Odeku St\nPass by Hazel Crest (on the right)', maneuver: 'TURN_LEFT', distance: { value: 800 }, polyline: '_p~iF~ps|U_ulLnnqC', endLocation: { lat: 38.5, lng: -120.2 } },
        { instruction: 'Arrive', maneuver: null, distance: { value: 100 }, polyline: '_mqNvxq`@', endLocation: { lat: 43.252, lng: -126.453 } },
      ],
    });
    expect(route).not.toBeNull();
    expect(route!.steps[0]).toEqual({ instruction: 'Turn left onto Adeola Odeku St', maneuver: 'TURN_LEFT', distanceM: 800, end: { latitude: 38.5, longitude: -120.2 } });
    expect(route!.coordinates.length).toBeGreaterThanOrEqual(3);
    expect(route!.distanceM).toBe(5000);
    expect(route!.durationS).toBe(600);
  });

  test('a route with no steps, or steps with no end, is unusable', () => {
    expect(toNavRoute(null)).toBeNull();
    expect(toNavRoute({ steps: [] })).toBeNull();
    expect(toNavRoute({ polyline: '_p~iF~ps|U', steps: [{ instruction: 'x', endLocation: null }] })).toBeNull();
  });

  test('stepping forward only, and off-route distance', () => {
    const steps = [
      { instruction: 'a', maneuver: null, distanceM: 1, end: { latitude: 0, longitude: 0.001 } },
      { instruction: 'b', maneuver: null, distanceM: 1, end: { latitude: 0, longitude: 0.002 } },
      { instruction: 'c', maneuver: null, distanceM: 1, end: { latitude: 0, longitude: 0.003 } },
    ];
    expect(advanceStep({ latitude: 0, longitude: 0.001 }, steps, 0)).toBe(1);
    expect(advanceStep({ latitude: 0, longitude: 0 }, steps, 1)).toBe(1); // never goes back
    expect(haversineM({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 })).toBeGreaterThan(100);
    expect(distanceFromRouteM({ latitude: 0.01, longitude: 0 }, [{ latitude: 0, longitude: 0 }])).toBeGreaterThan(1000);
  });
});
