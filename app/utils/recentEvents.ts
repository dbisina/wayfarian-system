// app/utils/recentEvents.ts
// Lightweight local cache for recent group events with a tiny pub/sub

import AsyncStorage from '@react-native-async-storage/async-storage';

export type RecentEventType =
  | 'member_joined'
  | 'member_left'
  | 'journey_started'
  | 'journey_completed'
  | 'instance_started'
  | 'instance_paused'
  | 'instance_resumed'
  | 'photo_uploaded'
  | 'message';

export interface RecentEvent {
  id: string; // unique id (timestamp + random)
  type: RecentEventType;
  ts: number; // epoch ms
  groupId: string; // for quick filtering
  groupJourneyId?: string | null;
  userId?: string;
  userName?: string | null;
  userPhotoURL?: string | null;
  message?: string; // optional human-readable text (prebuilt for offline)
  meta?: any; // minimal extra payload
}

const MAX_EVENTS = 50; // per group
const RETAIN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function key(groupId: string) {
  return `recent_events_${groupId}`;
}

// Simple pub/sub so UI can update immediately when events are added
type Listener = (groupId: string) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(groupId: string) {
  listeners.forEach((l) => {
    try { l(groupId); } catch {}
  });
}

export async function getEvents(groupId: string): Promise<RecentEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(key(groupId));
    if (!raw) return [];
    const arr: RecentEvent[] = JSON.parse(raw);
    // prune old here too (lazy pruning)
    const cutoff = Date.now() - RETAIN_MS;
    const pruned = arr.filter((e) => e.ts >= cutoff).slice(-MAX_EVENTS);
    if (pruned.length !== arr.length) {
      await AsyncStorage.setItem(key(groupId), JSON.stringify(pruned));
    }
    return pruned.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function addEvent(groupId: string, event: Omit<RecentEvent, 'id' | 'groupId' | 'ts'> & { ts?: number }) {
  const full: RecentEvent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: event.ts ?? Date.now(),
    groupId,
    type: event.type,
    groupJourneyId: event.groupJourneyId,
    userId: event.userId,
    userName: event.userName ?? undefined,
    userPhotoURL: event.userPhotoURL ?? undefined,
    message: event.message,
    meta: event.meta,
  };
  try {
    const existing = await getEvents(groupId);
    const next = [full, ...existing]
      .sort((a, b) => b.ts - a.ts)
      .filter((e) => e.ts >= Date.now() - RETAIN_MS)
      .slice(0, MAX_EVENTS);
    await AsyncStorage.setItem(key(groupId), JSON.stringify(next));
    notify(groupId);
  } catch {
    // ignore
  }
}

export function formatEvent(e: RecentEvent): string {
  // If a prebuilt message exists, use it.
  if (e.message) return e.message;
  const when = relativeTime(e.ts);
  switch (e.type) {
    case 'member_joined':
      return `${e.userName || 'Someone'} joined the group • ${when}`;
    case 'member_left':
      return `${e.userName || 'Someone'} left the group • ${when}`;
    case 'journey_started':
      return `Group journey started • ${when}`;
    case 'journey_completed':
      return `Group journey completed • ${when}`;
    case 'instance_started':
      return `${e.userName || 'A rider'} started riding • ${when}`;
    case 'instance_paused':
      return `${e.userName || 'A rider'} paused • ${when}`;
    case 'instance_resumed':
      return `${e.userName || 'A rider'} resumed • ${when}`;
    case 'photo_uploaded':
      return `${e.userName || 'A rider'} shared a photo • ${when}`;
    case 'message':
    default:
      return e.message || `Event • ${when}`;
  }
}

export function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
