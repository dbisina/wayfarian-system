// app/v2/awards.ts
// The three "crew awards" on a finished group ride, worked out from each rider's recorded ride.

export interface RiderResult {
  userId: string;
  displayName: string | null;
  distanceM: number;
  movingTimeS: number;
  topSpeedMps: number;
  avgSpeedMps: number;
}

export interface Award { key: string; award: string; userId: string; name: string; value: string }

const kmh = (mps: number) => `${Math.round(mps * 3.6)} km/h`;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

/** Fastest, furthest and steadiest (best average speed). Needs at least one rider; ties go to the first listed. */
export function crewAwards(riders: RiderResult[]): Award[] {
  if (riders.length === 0) return [];
  const best = (score: (r: RiderResult) => number) => riders.reduce((a, b) => (score(b) > score(a) ? b : a));
  const name = (r: RiderResult) => r.displayName || 'Rider';
  const fast = best((r) => r.topSpeedMps);
  const far = best((r) => r.distanceM);
  const steady = best((r) => r.avgSpeedMps);
  return [
    { key: 'fastest', award: 'Fastest', userId: fast.userId, name: name(fast), value: kmh(fast.topSpeedMps) },
    { key: 'furthest', award: 'Furthest', userId: far.userId, name: name(far), value: km(far.distanceM) },
    { key: 'steadiest', award: 'Steadiest', userId: steady.userId, name: name(steady), value: kmh(steady.avgSpeedMps) },
  ];
}
