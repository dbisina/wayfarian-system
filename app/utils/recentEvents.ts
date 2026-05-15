/**
 * Lightweight local cache for recent group events with a pub/sub notification layer.
 *
 * Events are stored per group in AsyncStorage and pruned to `MAX_EVENTS` entries
 * no older than `RETAIN_MS`. Pruning is lazy — it runs on read rather than write
 * to keep the write path fast.
 */

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
  id: string;
  type: RecentEventType;
  ts: number;
  groupId: string;
  groupJourneyId?: string | null;
  userId?: string;
  userName?: string | null;
  userPhotoURL?: string | null;
  /** Pre-built human-readable summary, preferred over the `formatEvent` fallback. */
  message?: string;
  meta?: any;
}

const MAX_EVENTS = 50;
const RETAIN_MS = 7 * 24 * 60 * 60 * 1000;

function key(groupId: string) {
  return `recent_events_${groupId}`;
}

type Listener = (groupId: string) => void;
const listeners = new Set<Listener>();

/**
 * Registers a listener that is called whenever events are added for any group.
 * @param listener - Callback receiving the affected `groupId`.
 * @returns An unsubscribe function.
 */
export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(groupId: string) {
  listeners.forEach((l) => {
    try { l(groupId); } catch {}
  });
}

/**
 * Returns stored events for a group, sorted newest-first.
 * Lazily prunes entries older than `RETAIN_MS` and beyond `MAX_EVENTS`.
 * @param groupId - The group whose events to retrieve.
 */
export async function getEvents(groupId: string): Promise<RecentEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(key(groupId));
    if (!raw) return [];
    const arr: RecentEvent[] = JSON.parse(raw);
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

/**
 * Appends an event to the group's stored list and notifies subscribers.
 * The list is re-pruned on every write so storage never grows unbounded.
 * @param groupId - The group to add the event to.
 * @param event - Event payload (without `id`, `groupId`, or `ts`, which are auto-assigned).
 */
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

/**
 * Returns a human-readable summary for an event.
 * Uses `event.message` when present; falls back to type-specific templates.
 * @param e - The event to format.
 */
export function formatEvent(e: RecentEvent): string {
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

/**
 * Formats a Unix timestamp as a human-readable relative time string (e.g. "5m ago").
 * @param ts - Epoch milliseconds.
 */
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
