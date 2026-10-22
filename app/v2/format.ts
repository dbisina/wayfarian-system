// app/v2/format.ts
// Unit conversion at the UI edge only. Everything inside v2 is metres, seconds and m/s.

export const mpsToKmh = (mps: number) => mps * 3.6;
export const mpsToMph = (mps: number) => mps * 2.2369362921;

export function formatDistance(m: number, units: 'km' | 'mi' = 'km'): string {
  if (!Number.isFinite(m) || m < 0) m = 0;
  if (units === 'mi') return `${(m / 1609.344).toFixed(2)} mi`;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

export function formatSpeed(mps: number, units: 'km' | 'mi' = 'km'): string {
  if (!Number.isFinite(mps) || mps < 0) mps = 0;
  return units === 'mi' ? `${Math.round(mpsToMph(mps))} mph` : `${Math.round(mpsToKmh(mps))} km/h`;
}

export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(totalS) ? totalS : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
