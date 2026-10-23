import { describe, expect, test, vi } from 'vitest';

// The module imports native pieces at load time; only the pure builder and helpers are under test.
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
vi.mock('@notifee/react-native', () => ({
  default: {},
  AndroidCategory: { NAVIGATION: 'navigation' },
  AndroidForegroundServiceType: { FOREGROUND_SERVICE_TYPE_LOCATION: 8 },
  AndroidImportance: { LOW: 2 },
  AndroidVisibility: { PUBLIC: 1 },
}));

import { buildRideNotification, clock, isRideAction, RIDE_ACTIONS } from '../rideNotification';
import type { LiveStats } from '../recorder';

const live = (over: Partial<LiveStats> = {}): LiveStats => ({
  rideId: 'r1', status: 'RECORDING', startedAt: 1_000, distanceM: 64_200, movingTimeS: 2_832, elapsedTimeS: 2_900,
  topSpeedMps: 38, avgSpeedMps: 22, pointsAccepted: 10, pointsRejected: 0,
  lastFix: { lat: 6.4, lng: 3.4, t: 2, speedMps: 24.17 }, ...over,
});

describe('ride notification', () => {
  test('a recording ride shows distance, speed, a running timer and the three buttons', () => {
    const n = buildRideNotification(live());
    expect(n.title).toBe('Wayfarian ride');
    expect(n.body).toBe('64.2 km ridden · 87 km/h');
    expect(n.subtitle).toBe('Recording');
    expect(n.android.showChronometer).toBe(true);
    expect(n.android.timestamp).toBe(1_000);
    expect(n.android.actions.map((a) => a.title)).toEqual(['Photo', 'Pause', 'Finish']);
    expect(n.android.actions[1].pressAction.id).toBe(RIDE_ACTIONS.PAUSE);
  });

  test('it is the foreground service of type location, so there is one notification', () => {
    const n = buildRideNotification(live());
    expect(n.android.asForegroundService).toBe(true);
    expect(n.android.foregroundServiceTypes).toEqual([8]);
    expect(n.android.ongoing).toBe(true);
  });

  test('a paused ride says so, stops the timer and offers Resume', () => {
    const n = buildRideNotification(live({ status: 'PAUSED' }));
    expect(n.title).toBe('Ride paused');
    expect(n.body).toBe('64.2 km · 0:47:12');
    expect(n.android.showChronometer).toBe(false);
    expect(n.android.actions[1]).toMatchObject({ title: 'Resume', pressAction: { id: RIDE_ACTIONS.RESUME } });
  });

  test('route progress shows only when it is known, clamped to 0 to 100', () => {
    expect(buildRideNotification(live()).android).not.toHaveProperty('progress');
    expect(buildRideNotification(live(), { progress: 0.523 }).android.progress).toEqual({ max: 100, current: 52, indeterminate: false });
    expect(buildRideNotification(live(), { progress: 4 }).android.progress.current).toBe(100);
    expect(buildRideNotification(live(), { progress: -1 }).android.progress.current).toBe(0);
  });

  test('no GPS fix yet shows 0 km/h and a named ride shows its name', () => {
    const n = buildRideNotification(live({ lastFix: null }), { title: 'Lekki to Ibadan' });
    expect(n.title).toBe('Lekki to Ibadan');
    expect(n.body).toContain('0 km/h');
  });

  test('clock and button id helpers', () => {
    expect(clock(2_832)).toBe('0:47:12');
    expect(clock(-5)).toBe('0:00:00');
    expect(isRideAction('ride_pause')).toBe(true);
    expect(isRideAction('pause_journey')).toBe(false);
    expect(isRideAction(undefined)).toBe(false);
  });
});
