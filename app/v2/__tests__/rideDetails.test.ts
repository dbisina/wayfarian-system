import { describe, expect, test } from 'vitest';
import { emergencyNumber, isValidPhone, mapsLink, normalizePhone, shareSpotMessage, smsUrl, sosMessage } from '../emergency';
import { bearingDeg, viewCone } from '../mapCamera';
import { nativeMapType, usesCustomStyle } from '../mapStyle';
import { rideXp } from '../rideXp';
import { MIN_GAP_MS, pickDisplayLimit, REFETCH_MS, shouldLookUp, signValue } from '../speedLimit';

describe('nativeMapType', () => {
  test('standard and satellite are the same on both phones', () => {
    expect(nativeMapType('standard', 'ios')).toBe('standard');
    expect(nativeMapType('standard', 'android')).toBe('standard');
    expect(nativeMapType('satellite', 'ios')).toBe('hybrid');
    expect(nativeMapType('satellite', 'android')).toBe('hybrid');
  });

  test('terrain exists only on Android; an iPhone shows standard', () => {
    expect(nativeMapType('terrain', 'android')).toBe('terrain');
    expect(nativeMapType('terrain', 'ios')).toBe('standard');
  });

  test('the warm custom style only goes on Android’s standard layer', () => {
    expect(usesCustomStyle('standard', 'android')).toBe(true);
    expect(usesCustomStyle('hybrid', 'android')).toBe(false);
    expect(usesCustomStyle('terrain', 'android')).toBe(false);
    expect(usesCustomStyle('standard', 'ios')).toBe(false);
  });
});

describe('rideXp (mirrors server/constants/rideXp.js)', () => {
  test('nothing under 100 m, 2 XP a km after', () => {
    expect(rideXp(0)).toBe(0);
    expect(rideXp(99)).toBe(0);
    expect(rideXp(100)).toBe(0); // 0.1 km floors to 0
    expect(rideXp(1_000)).toBe(2);
    expect(rideXp(64_200)).toBe(128);
  });

  test('50 bonus at 100 km', () => {
    expect(rideXp(99_999)).toBe(199);
    expect(rideXp(100_000)).toBe(250);
  });

  test('junk is worth nothing', () => {
    expect(rideXp(NaN)).toBe(0);
    expect(rideXp(-5)).toBe(0);
  });
});

describe('emergency helpers', () => {
  test('number by country, 112 otherwise', () => {
    expect(emergencyNumber('NG')).toBe('112');
    expect(emergencyNumber('us')).toBe('911');
    expect(emergencyNumber('GB')).toBe('999');
    expect(emergencyNumber(undefined)).toBe('112');
    expect(emergencyNumber('ZZ')).toBe('112');
  });

  test('phone numbers are cleaned and checked', () => {
    expect(normalizePhone(' +234 (707) 721-3386 ')).toBe('+2347077213386');
    expect(normalizePhone('0707 721 3386')).toBe('07077213386');
    expect(isValidPhone('+234 707 721 3386')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('call me')).toBe(false);
  });

  test('messages carry a map link to the spot', () => {
    expect(mapsLink(6.5, 3.4)).toBe('https://maps.google.com/?q=6.500000,3.400000');
    expect(sosMessage(6.5, 3.4)).toContain('https://maps.google.com/?q=6.500000,3.400000');
    expect(shareSpotMessage(6.5, 3.4, 'Ibadan')).toContain('Heading to Ibadan');
    expect(shareSpotMessage(6.5, 3.4)).not.toContain('Heading to');
  });

  test('sms links differ by platform and take several numbers', () => {
    const body = 'SOS & help';
    expect(smsUrl(['+234 707 721 3386', '0803 000 1111'], body, 'ios')).toBe('sms:/open?addresses=+2347077213386,08030001111&body=SOS%20%26%20help');
    expect(smsUrl(['+234 707 721 3386', '0803 000 1111'], body, 'android')).toBe('sms:+2347077213386,08030001111?body=SOS%20%26%20help');
  });
});

describe('viewCone', () => {
  const c = { latitude: 6.5, longitude: 3.4 };

  test('starts at the rider and fans out ahead of them', () => {
    const cone = viewCone(c, 0, 90, 30, 4);
    expect(cone[0]).toEqual(c);
    expect(cone).toHaveLength(6);
    // Heading north: every arc point is north of the rider.
    for (const p of cone.slice(1)) expect(p.latitude).toBeGreaterThan(c.latitude);
  });

  test('the middle of the arc is straight ahead and the whole arc sits 90 m out', () => {
    const cone = viewCone(c, 90, 90, 30, 4);
    const mid = cone[3];
    expect(bearingDeg(c, mid)).toBeCloseTo(90, 0);
    const metres = Math.hypot((mid.latitude - c.latitude) * 110540, (mid.longitude - c.longitude) * 111320 * Math.cos((c.latitude * Math.PI) / 180));
    expect(metres).toBeCloseTo(90, 0);
  });
});

describe('speed limit lookups', () => {
  const here = { latitude: 6.5, longitude: 3.4 };
  const moved = { latitude: 6.5, longitude: 3.4 + 0.002 }; // ~220 m east

  test('the first fix always asks', () => {
    expect(shouldLookUp({ at: null, t: 0 }, here, 1000)).toBe(true);
  });

  test('then waits: never twice in quick succession, and not for a short hop', () => {
    const s = { at: here, t: 100_000 };
    expect(shouldLookUp(s, moved, 100_000 + MIN_GAP_MS - 1)).toBe(false);
    expect(shouldLookUp(s, { latitude: 6.5, longitude: 3.4005 }, 100_000 + 10_000)).toBe(false);
  });

  test('asks again after 150 m, or after 20 s even if standing still', () => {
    const s = { at: here, t: 100_000 };
    expect(shouldLookUp(s, moved, 100_000 + MIN_GAP_MS)).toBe(true);
    expect(shouldLookUp(s, here, 100_000 + REFETCH_MS)).toBe(true);
  });

  test('the route’s limit wins over a lookup; unknown stays unknown', () => {
    expect(pickDisplayLimit(80, 60)).toBe(80);
    expect(pickDisplayLimit(null, 60)).toBe(60);
    expect(pickDisplayLimit(undefined, null)).toBeNull();
    expect(pickDisplayLimit(0, 0)).toBeNull();
  });

  test('the sign reads in the rider’s unit', () => {
    expect(signValue(100, 'km')).toBe(100);
    expect(signValue(100, 'mi')).toBe(60); // 62 mph rounds to the 60 sign
    expect(signValue(50, 'mi')).toBe(30);
  });
});

describe('parseContacts', () => {
  test('keeps valid contacts, cleans their numbers, drops junk and caps at three', async () => {
    const { parseContacts } = await import('../emergency');
    const stored = JSON.stringify([
      { name: ' Mum ', phone: '+234 803 000 1111' },
      { name: 'Bad', phone: 'abc' },
      { name: 5, phone: '+2348030001112' },
      { name: 'B', phone: '08030001113' },
      { name: 'C', phone: '08030001114' },
      { name: 'D', phone: '08030001115' },
    ]);
    expect(parseContacts(stored)).toEqual([
      { name: 'Mum', phone: '+2348030001111' },
      { name: 'B', phone: '08030001113' },
      { name: 'C', phone: '08030001114' },
    ]);
  });

  test('nothing, garbage or the wrong shape is an empty list', async () => {
    const { parseContacts } = await import('../emergency');
    expect(parseContacts(null)).toEqual([]);
    expect(parseContacts('not json')).toEqual([]);
    expect(parseContacts('{"a":1}')).toEqual([]);
  });
});

describe('bug report', () => {
  test('needs a real description and a sane email', async () => {
    const { reportProblem } = await import('../bugReport');
    expect(reportProblem('too short', '')).toMatch(/at least/);
    expect(reportProblem('The map froze when I paused', '')).toBeNull();
    expect(reportProblem('The map froze when I paused', 'nope')).toMatch(/email/);
    expect(reportProblem('The map froze when I paused', 'a@b.co')).toBeNull();
  });

  test('device details are added only when allowed and carry no location', async () => {
    const { reportBody, deviceLines } = await import('../bugReport');
    const device = { appVersion: '2.0.1', model: 'iPhone 15', os: 'iOS', osVersion: '19.1' };
    const base = { message: '  The map froze when I paused  ', email: '', device };
    expect(reportBody({ ...base, includeDevice: false })).toBe('The map froze when I paused');
    const full = reportBody({ ...base, includeDevice: true });
    expect(full).toContain('The map froze when I paused\n\nApp: Wayfarian 2.0.1');
    expect(full).toContain('Phone: iPhone 15');
    expect(full).toContain('System: iOS 19.1');
    expect(deviceLines({})).toEqual([]);
  });

  test('the email fallback goes to the developer with the report encoded', async () => {
    const { reportMailto, DEVELOPER_EMAIL } = await import('../bugReport');
    const url = reportMailto({ message: 'Pins & photos missing', email: '', includeDevice: false, device: {} });
    expect(url.startsWith(`mailto:${DEVELOPER_EMAIL}?subject=`)).toBe(true);
    expect(url).toContain('Pins%20%26%20photos%20missing');
  });
});
