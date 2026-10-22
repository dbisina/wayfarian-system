// app/v2/liveActivity.ts
//
// Mirrors the live ride onto the iOS lock screen / Dynamic Island (Live Activity). Android shows
// its single persistent notification from the location task itself, so nothing is done there:
// a second notification would be the duplicate we are removing.

import { Platform } from 'react-native';
import { dismissJourneyNotification, updateJourneyNotification } from '../services/liveNotificationService';
import { getRuntime } from './runtime';
import type { LiveStats } from './recorder';

const MIN_INTERVAL_MS = 2000;

/** Pure: what the Live Activity needs from a live ride. */
export function toActivityData(s: LiveStats) {
  return {
    journeyId: s.rideId,
    startTime: s.startedAt,
    totalDistance: s.distanceM / 1000, // km
    currentSpeed: (s.lastFix?.speedMps ?? 0) * 3.6, // km/h
    avgSpeed: s.avgSpeedMps * 3.6,
    topSpeed: s.topSpeedMps * 3.6,
    movingTime: s.movingTimeS,
    progress: 0,
    isPaused: s.status === 'PAUSED',
  };
}

export function startLiveActivityBridge(): () => void {
  if (Platform.OS !== 'ios') return () => {};
  const rt = getRuntime();
  let last = 0;
  let active = false;
  const onLive = (s: LiveStats | null) => {
    if (!s || s.status === 'ENDED') {
      if (active) { active = false; void dismissJourneyNotification(); }
      return;
    }
    const now = Date.now();
    if (active && now - last < MIN_INTERVAL_MS) return;
    last = now;
    active = true;
    void updateJourneyNotification(toActivityData(s));
  };
  rt.liveListeners.add(onLive);
  return () => { rt.liveListeners.delete(onLive); };
}
