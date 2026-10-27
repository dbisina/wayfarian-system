// app/v2/emergency.ts
// Helpers for the SOS sheet and "share my spot": which number to call, how to write a phone number,
// and the links and messages that go out. Nothing here sends anything; the rider taps in the sheet.

export interface EmergencyContact { name: string; phone: string }

export const MAX_EMERGENCY_CONTACTS = 3;

const OWN_NUMBER: Record<string, string> = { US: '911', CA: '911', GB: '999', KE: '999', AU: '000', NZ: '111' };

/** The emergency number for a country (ISO region code). 112 works across most of the world and in Nigeria. */
export const emergencyNumber = (region?: string | null): string => OWN_NUMBER[String(region ?? '').toUpperCase()] ?? '112';

/** Digits with an optional leading +, no spaces, dashes or brackets. */
export const normalizePhone = (raw: string): string => {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '');
};

/** 7 to 15 digits, as in E.164 (the international numbering standard). */
export const isValidPhone = (raw: string): boolean => /^\+?\d{7,15}$/.test(normalizePhone(raw));

export const mapsLink = (latitude: number, longitude: number): string =>
  `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

export const sosMessage = (latitude: number, longitude: number): string =>
  `SOS. I need help. My location: ${mapsLink(latitude, longitude)} (sent from Wayfarian)`;

export const shareSpotMessage = (latitude: number, longitude: number, destination?: string | null): string =>
  `I'm riding with Wayfarian. I'm here: ${mapsLink(latitude, longitude)}` + (destination ? `. Heading to ${destination}.` : '.');

/**
 * A link that opens the messaging app with a drafted text. The platforms disagree on how to write
 * it: iOS wants addresses in a query, Android takes a comma-separated list in the path.
 */
export function smsUrl(numbers: string[], body: string, platform: string): string {
  const list = numbers.map(normalizePhone).filter(Boolean).join(',');
  const text = encodeURIComponent(body);
  return platform === 'ios' ? `sms:/open?addresses=${list}&body=${text}` : `sms:${list}?body=${text}`;
}

/** Reads saved contacts back safely: anything malformed is dropped rather than trusted. */
export function parseContacts(json: string | null | undefined): EmergencyContact[] {
  try {
    const raw = JSON.parse(json || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c) => c && typeof c.name === 'string' && typeof c.phone === 'string' && isValidPhone(c.phone))
      .slice(0, MAX_EMERGENCY_CONTACTS)
      .map((c) => ({ name: c.name.trim().slice(0, 40), phone: normalizePhone(c.phone) }));
  } catch {
    return [];
  }
}
