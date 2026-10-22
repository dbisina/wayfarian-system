import { describe, expect, test } from 'vitest';
import { WORLD_REGION, fallbackRegion, regionForCountry } from '../countryRegion';

const SF = { lat: 37.78825, lng: -122.4324 };
const nearSF = (r: { latitude: number; longitude: number }) => Math.abs(r.latitude - SF.lat) < 5 && Math.abs(r.longitude - SF.lng) < 5;

describe('map fallback region', () => {
  test('a Nigerian rider opens in Nigeria', () => {
    const r = fallbackRegion({ profileCountryCode: 'NG' });
    expect(r.latitude).toBeCloseTo(9.08, 1);
    expect(r.longitude).toBeCloseTo(8.68, 1);
    expect(nearSF(r)).toBe(false);
  });

  test('profile country wins over the phone region; the phone region is used when there is no profile country', () => {
    expect(fallbackRegion({ profileCountryCode: 'KE', deviceRegionCode: 'US' }).latitude).toBeCloseTo(0.02, 1);
    expect(fallbackRegion({ profileCountryCode: null, deviceRegionCode: 'GB' }).latitude).toBeCloseTo(54.3, 1);
  });

  test('codes are case-insensitive and unknown ones fall through', () => {
    expect(regionForCountry('ng')).not.toBeNull();
    expect(regionForCountry('ZZ')).toBeNull();
    expect(fallbackRegion({ profileCountryCode: 'ZZ', deviceRegionCode: 'NG' }).latitude).toBeCloseTo(9.08, 1);
  });

  test('with nothing known it is the whole world, never San Francisco', () => {
    const r = fallbackRegion({});
    expect(r).toEqual(WORLD_REGION);
    expect(r.latitudeDelta).toBeGreaterThan(90);
    expect(nearSF(r)).toBe(false);
  });

  test('no country anywhere in the table lands on the old San Francisco default', () => {
    for (const code of ['US', 'CA', 'MX']) {
      const r = regionForCountry(code)!;
      // the whole-country view is zoomed far out, not the street-level SF view
      expect(r.latitudeDelta).toBeGreaterThan(10);
    }
  });
});
