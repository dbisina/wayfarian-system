import { describe, expect, test, vi } from 'vitest';

// The module imports React Native pieces at load time; only the pure mapper is under test.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../../services/liveNotificationService', () => ({ dismissJourneyNotification: vi.fn(), updateJourneyNotification: vi.fn() }));
vi.mock('../runtime', () => ({ getRuntime: () => ({ liveListeners: new Set() }) }));

import { toActivityData } from '../liveActivity';

describe('live activity mapping', () => {
  test('converts metres and m/s to the km and km/h the activity shows', () => {
    const out = toActivityData({
      rideId: 'r1', status: 'RECORDING', startedAt: 1000, distanceM: 12500, movingTimeS: 900, elapsedTimeS: 950,
      topSpeedMps: 30, avgSpeedMps: 10, pointsAccepted: 1, pointsRejected: 0,
      lastFix: { lat: 1, lng: 1, t: 2, speedMps: 20 },
    });
    expect(out).toMatchObject({ journeyId: 'r1', startTime: 1000, totalDistance: 12.5, currentSpeed: 72, avgSpeed: 36, topSpeed: 108, isPaused: false });
  });
  test('paused rides and rides with no fix yet are handled', () => {
    const out = toActivityData({
      rideId: 'r1', status: 'PAUSED', startedAt: 1, distanceM: 0, movingTimeS: 0, elapsedTimeS: 0, topSpeedMps: 0, avgSpeedMps: 0, pointsAccepted: 0, pointsRejected: 0, lastFix: null,
    });
    expect(out).toMatchObject({ currentSpeed: 0, isPaused: true });
  });
});
