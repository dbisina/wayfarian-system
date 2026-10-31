import { describe, expect, test } from 'vitest';
import type { MapPhoto } from '../api';
import { clockDuration, clusterPhotos, defaultYear } from '../memories';

const photo = (id: string, lat: number, lng: number, takenAt = '2026-10-18T10:00:00Z'): MapPhoto => ({
  id,
  rideId: 'r1',
  takenAt,
  latitude: lat,
  longitude: lng,
  imageUrl: `full-${id}`,
  thumbnailUrl: `thumb-${id}`,
  ride: { title: 'Obudu', startedAt: takenAt, distanceM: 142_000, elapsedTimeS: 11_280 },
});

describe('clusterPhotos', () => {
  test('photos at the same spot become one pin, newest first', () => {
    const out = clusterPhotos([photo('a', 6.5, 3.4, '2026-10-18T09:00:00Z'), photo('b', 6.5001, 3.4001, '2026-10-18T11:00:00Z')], 1);
    expect(out).toHaveLength(1);
    expect(out[0].photos.map((p) => p.id)).toEqual(['b', 'a']);
    expect(out[0].latitude).toBeCloseTo(6.50005, 5);
  });

  test('far-apart photos stay separate, and zooming in splits a cluster', () => {
    const photos = [photo('a', 6.5, 3.4), photo('b', 6.52, 3.42)];
    expect(clusterPhotos(photos, 5)).toHaveLength(1);
    expect(clusterPhotos(photos, 0.05)).toHaveLength(2);
  });

  test('the pin id does not change when the order of photos does', () => {
    const a = clusterPhotos([photo('a', 6.5, 3.4), photo('b', 6.5, 3.4)], 1);
    const b = clusterPhotos([photo('b', 6.5, 3.4), photo('a', 6.5, 3.4)], 1);
    expect(a[0].id).toBe(b[0].id);
  });

  test('skips photos with no usable position', () => {
    expect(clusterPhotos([photo('a', NaN, 3.4)], 1)).toEqual([]);
  });
});

describe('defaultYear', () => {
  test('prefers this year, else the newest, else nothing', () => {
    expect(defaultYear([2026, 2025], new Date('2026-06-01'))).toBe(2026);
    expect(defaultYear([2025, 2024], new Date('2026-06-01'))).toBe(2025);
    expect(defaultYear([])).toBeUndefined();
  });
});

describe('clockDuration', () => {
  test('hours and minutes', () => {
    expect(clockDuration(11_280)).toBe('3:08');
    expect(clockDuration(59)).toBe('0:00');
    expect(clockDuration(60)).toBe('0:01');
  });
});

describe('photos from the older journeys', () => {
  test('a v1 photo clusters with v2 photos taken in the same spot', () => {
    const v1: MapPhoto = { ...photo('v1-a', 6.5, 3.4), rideId: null, journeyId: 'j1' };
    const out = clusterPhotos([photo('b', 6.5001, 3.4001), v1], 1);
    expect(out).toHaveLength(1);
    expect(out[0].photos.map((p) => p.id).sort()).toEqual(['b', 'v1-a']);
  });
});
