// app/v2/locationEngine.ts
//
// The single GPS pipeline, identical on iOS and Android: one expo-location background task that
// feeds the recorder, in the foreground and the background alike. There is no second watcher,
// no second notification and no platform-specific stats path. This module must be imported at
// app start (see app/_layout.tsx) because TaskManager tasks have to be defined at the top level
// before the OS can deliver location updates to a freshly launched, UI-less app.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { ensureRestored, getRuntime } from './runtime';
import { processLocations, type OsLocation } from './locationAdapter';

export const LOCATION_TASK = 'wayfarian-v2-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations?: OsLocation[] }>) => {
  if (error) {
    console.warn('[v2/location] task error', error.message);
    return;
  }
  const locations = data?.locations;
  if (!locations?.length) return;
  try {
    await ensureRestored();
    const rt = getRuntime();
    const live = await processLocations(rt.recorder, locations);
    if (live) rt.emitLive(live);
  } catch (err) {
    console.warn('[v2/location] failed to record fixes', err);
  }
});

export interface TrackingPermission {
  foreground: boolean;
  /** "Always" on iOS, background access on Android. Without it tracking stops when the app is backgrounded. */
  background: boolean;
}

/**
 * Asks for location the same way on both platforms: foreground first, then background ("Always").
 * The caller shows the shared disclosure screen before calling this.
 */
export async function requestTrackingPermission(): Promise<TrackingPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { foreground: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.status === 'granted' };
}

export async function getTrackingPermission(): Promise<TrackingPermission> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return { foreground: fg.status === 'granted', background: bg.status === 'granted' };
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

export interface TrackingOptions {
  /** Shown in the one foreground-service notification on Android. */
  notificationTitle?: string;
  notificationBody?: string;
  /** Slower, more battery friendly sampling for walking/cycling style vehicles. */
  vehicleType?: string;
}

/** Start (or restart after a resume) the OS location updates. Idempotent. */
export async function startTracking(opts: TrackingOptions = {}): Promise<void> {
  if (await isTracking()) return;
  const slow = opts.vehicleType === 'bicycle' || opts.vehicleType === 'bike' || opts.vehicleType === 'walk';
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    // distanceInterval is honoured on both platforms; timeInterval only on Android, so it is
    // set to the same cadence and simply ignored on iOS.
    distanceInterval: slow ? 3 : 5,
    timeInterval: 1000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false, // iOS must not decide the ride is over at a red light
    showsBackgroundLocationIndicator: true,
    // Android: the one and only foreground notification for a ride. iOS ignores this block.
    foregroundService: Platform.OS === 'android'
      ? {
          notificationTitle: opts.notificationTitle ?? 'Wayfarian is recording your ride',
          notificationBody: opts.notificationBody ?? 'Tap to return to your ride',
          notificationColor: '#2196F3',
          killServiceOnDestroy: false,
        }
      : undefined,
  });
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
