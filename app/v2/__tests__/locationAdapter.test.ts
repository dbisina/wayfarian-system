import { describe, expect, test } from 'vitest';
import { processLocations, toFixes, type OsLocation } from '../locationAdapter';

const loc = (t: number, lng = 3.4, extra: Partial<OsLocation['coords']> = {}): OsLocation => ({ coords: { latitude: 6.45, longitude: lng, accuracy: 5, ...extra }, timestamp: t });
const NOW = 1_800_000_000_000;

describe('location adapter', () => {
  test('orders late/out-of-order OS batches and maps fields', () => {
    const fixes = toFixes([loc(NOW - 1000, 3.41), loc(NOW - 3000, 3.4), loc(NOW - 2000, 3.405)], NOW);
    expect(fixes.map((f) => f.t)).toEqual([NOW - 3000, NOW - 2000, NOW - 1000]);
    expect(fixes[0]).toEqual({ lat: 6.45, lng: 3.4, t: NOW - 3000, accuracy: 5 });
  });

  test('drops garbage, future-dated and ancient replayed fixes', () => {
    const bad = [
      loc(NOW - 1000, NaN),
      { coords: { latitude: 6.45, longitude: 3.4 }, timestamp: NaN } as OsLocation,
      loc(NOW + 10 * 60_000),
      loc(NOW - 48 * 3600_000),
      loc(NOW - 500),
    ];
    expect(toFixes(bad, NOW).map((f) => f.t)).toEqual([NOW - 500]);
  });

  test('feeds the recorder in order and returns the newest stats', async () => {
    const seen: number[] = [];
    const recorder = { addFix: async (f: any) => { seen.push(f.t); return { distanceM: seen.length } as any; } };
    const out = await processLocations(recorder, [loc(NOW - 1000), loc(NOW - 3000), loc(NOW - 2000)], NOW);
    expect(seen).toEqual([NOW - 3000, NOW - 2000, NOW - 1000]);
    expect(out).toEqual({ distanceM: 3 });
  });

  test('returns null when no ride is recording', async () => {
    expect(await processLocations({ addFix: async () => null }, [loc(NOW - 1000)], NOW)).toBeNull();
  });
});
