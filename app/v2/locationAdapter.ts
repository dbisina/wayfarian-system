// app/v2/locationAdapter.ts
//
// Turns the batches the OS hands to the background location task into recorder fixes. iOS and
// Android both deliver arrays of locations that can be late, duplicated or out of order, and
// that may arrive after the app was relaunched in the background, so this is the one place that
// order, filters and feeds them. It is pure so both platforms are tested identically.

import type { Fix, LiveStats, Recorder } from './recorder';

export interface OsLocation {
  coords: { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null };
  /** Milliseconds since the epoch. */
  timestamp: number;
  mocked?: boolean;
}

/** Fixes older than this when they arrive are almost certainly replays from a stale OS buffer. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function toFixes(locations: OsLocation[], now: number): Fix[] {
  return locations
    .filter((l) => l && l.coords && Number.isFinite(l.coords.latitude) && Number.isFinite(l.coords.longitude) && Number.isFinite(l.timestamp))
    .filter((l) => l.timestamp <= now + 60_000 && now - l.timestamp <= MAX_AGE_MS)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((l) => ({ lat: l.coords.latitude, lng: l.coords.longitude, t: l.timestamp, accuracy: l.coords.accuracy ?? null }));
}

/** Feed a batch to the recorder in time order. Returns the latest live stats, if a ride is recording. */
export async function processLocations(recorder: Pick<Recorder, 'addFix'>, locations: OsLocation[], now = Date.now()): Promise<LiveStats | null> {
  let last: LiveStats | null = null;
  for (const fix of toFixes(locations, now)) {
    const res = await recorder.addFix(fix);
    if (res) last = res;
  }
  return last;
}
