// app/v2/memories.ts
// Groups the rider's geotagged photos into map pins. Photos from the same spot (a stop on a ride,
// a viewpoint) become one pin with a count, so the map stays readable when zoomed out and fans out
// into single photos as the rider zooms in.

import type { MapPhoto } from './api';

export interface MemoryCluster {
  /** Stable for the same set of photos, so a selected pin stays selected when the map moves. */
  id: string;
  latitude: number;
  longitude: number;
  /** Newest first. */
  photos: MapPhoto[];
}

/**
 * Buckets photos into a grid whose cell is `latitudeDelta / cellsAcrossScreen` degrees, so a pin
 * always covers about the same share of the screen. The pin sits at the average of its photos.
 */
export function clusterPhotos(photos: MapPhoto[], latitudeDelta: number, cellsAcrossScreen = 7): MemoryCluster[] {
  const cell = Math.max(latitudeDelta / cellsAcrossScreen, 1e-5);
  const buckets = new Map<string, MapPhoto[]>();
  for (const p of photos) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const key = `${Math.floor(p.latitude / cell)}:${Math.floor(p.longitude / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  return [...buckets.values()].map((list) => {
    const sorted = [...list].sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : a.id < b.id ? -1 : 1));
    return {
      id: sorted.map((p) => p.id).sort()[0],
      latitude: sorted.reduce((s, p) => s + p.latitude, 0) / sorted.length,
      longitude: sorted.reduce((s, p) => s + p.longitude, 0) / sorted.length,
      photos: sorted,
    };
  });
}

/** Years the picker offers, newest first, with the current year pre-selected when it has photos. */
export function defaultYear(years: number[], now = new Date()): number | undefined {
  if (!years.length) return undefined;
  const thisYear = now.getFullYear();
  return years.includes(thisYear) ? thisYear : Math.max(...years);
}

/** "3:08" for 11280 s. */
export function clockDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
