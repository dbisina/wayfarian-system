// app/v2/rideNotification.ts
//
// The rich Android ride notification from the "Live activity · Android" board: the ride's distance
// and speed, a live timer, route progress and Photo / Pause / Finish buttons.
//
// It is a beta setting, off by default. When on, this notification IS the location foreground
// service (so there is still only one notification) and expo-location runs without its own plain
// one. If the notification cannot be shown the engine falls back to the plain one, so tracking
// never depends on this.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidCategory, AndroidForegroundServiceType, AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import type { LiveStats } from './recorder';

export const RICH_NOTIFICATION_KEY = 'wayfarian_rich_ride_notification';
export const RIDE_CHANNEL_ID = 'ride-live';
export const RIDE_NOTIFICATION_ID = 'ride-live';

export const RIDE_ACTIONS = { PHOTO: 'ride_photo', PAUSE: 'ride_pause', RESUME: 'ride_resume', FINISH: 'ride_finish' } as const;

let enabled: boolean | null = null;

export async function isRichNotificationEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (enabled !== null) return enabled;
  try {
    enabled = (await AsyncStorage.getItem(RICH_NOTIFICATION_KEY)) === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

export async function setRichNotificationEnabled(on: boolean): Promise<void> {
  enabled = on;
  await AsyncStorage.setItem(RICH_NOTIFICATION_KEY, on ? '1' : '0').catch(() => {});
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};

/** Pure: the notification for a live ride. Tested without a device. */
export function buildRideNotification(s: LiveStats, opts: { title?: string; progress?: number | null } = {}) {
  const paused = s.status === 'PAUSED';
  const km = (s.distanceM / 1000).toFixed(1);
  const kmh = Math.round((s.lastFix?.speedMps ?? 0) * 3.6);
  const title = paused ? 'Ride paused' : opts.title || 'Wayfarian ride';
  const body = paused ? `${km} km · ${clock(s.movingTimeS)}` : `${km} km ridden · ${kmh} km/h`;
  const progress = opts.progress != null && Number.isFinite(opts.progress) ? Math.min(100, Math.max(0, Math.round(opts.progress * 100))) : null;

  return {
    id: RIDE_NOTIFICATION_ID,
    title,
    body,
    subtitle: paused ? 'Paused' : 'Recording',
    android: {
      channelId: RIDE_CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_LOCATION],
      ongoing: true,
      onlyAlertOnce: true,
      smallIcon: 'ic_notification',
      color: '#2A2723',
      colorized: true,
      importance: AndroidImportance.LOW,
      category: AndroidCategory.NAVIGATION,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Photo', pressAction: { id: RIDE_ACTIONS.PHOTO, launchActivity: 'default' } },
        { title: paused ? 'Resume' : 'Pause', pressAction: { id: paused ? RIDE_ACTIONS.RESUME : RIDE_ACTIONS.PAUSE } },
        { title: 'Finish', pressAction: { id: RIDE_ACTIONS.FINISH } },
      ],
      ...(progress != null ? { progress: { max: 100, current: progress, indeterminate: false } } : {}),
      // A live timer that counts up from the start; it stops counting while paused.
      timestamp: s.startedAt,
      showTimestamp: true,
      showChronometer: !paused,
      chronometerDirection: 'up' as const,
    },
  };
}

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  await notifee.createChannel({ id: RIDE_CHANNEL_ID, name: 'Ride in progress', importance: AndroidImportance.LOW, vibration: false, sound: undefined });
  channelReady = true;
}

/** Shows or updates the notification. Returns false if it could not be shown (the caller falls back). */
export async function showRideNotification(s: LiveStats, opts: { title?: string; progress?: number | null } = {}): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await ensureChannel();
    await notifee.displayNotification(buildRideNotification(s, opts) as any);
    return true;
  } catch (e) {
    console.warn('[RideNotification] could not show:', (e as Error)?.message);
    return false;
  }
}

export async function hideRideNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try { await notifee.stopForegroundService(); } catch { /* not running */ }
  try { await notifee.cancelNotification(RIDE_NOTIFICATION_ID); } catch { /* already gone */ }
}

/** The buttons on the notification run the same commands as the ride screen. */
export async function handleRideAction(actionId: string | undefined): Promise<void> {
  // Imported on use: the controller pulls in the whole ride runtime.
  const { pauseRide, resumeRide, endRide } = await import('./rideController');
  switch (actionId) {
    case RIDE_ACTIONS.PAUSE: return pauseRide();
    case RIDE_ACTIONS.RESUME: return resumeRide();
    case RIDE_ACTIONS.FINISH: { await endRide(); return hideRideNotification(); }
    default: return; // Photo and tapping the card open the app, which is handled by launchActivity
  }
}

/** True for the ids of this notification's buttons. */
export const isRideAction = (id: unknown) => typeof id === 'string' && id.startsWith('ride_');
