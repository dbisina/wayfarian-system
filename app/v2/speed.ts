// app/v2/speed.ts
// The speed strip on the ride summary: the route's speed over time, squeezed into N bars.
// Speed is derived from the recorded points (distance between neighbours over their time gap),
// the same way for every ride on either platform. Gaps between segments are not speed.

export interface RoutePoint { segment: number; lat: number; lng: number; t: number }

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
function haversine(a: RoutePoint, b: RoutePoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SpeedStrip {
  bars: { mps: number; frac: number; hot: boolean }[];
  peakMps: number;
  /** Epoch ms of the fastest moment, or null when there is nothing to show. */
  peakAt: number | null;
}

/**
 * @param maxMps speeds above this are noise and are ignored (same ceiling as ride-core).
 * `hot` marks bars within 12% of the peak, which the design paints amber.
 */
export function speedStrip(points: RoutePoint[], buckets = 40, maxMps = 70): SpeedStrip {
  const samples: { t: number; mps: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.segment !== b.segment) continue;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > 300) continue;
    const mps = haversine(a, b) / dt;
    if (mps <= maxMps) samples.push({ t: b.t, mps });
  }
  if (samples.length === 0) return { bars: [], peakMps: 0, peakAt: null };

  const n = Math.min(buckets, samples.length);
  const bars: number[] = [];
  let peak = samples[0];
  for (const s of samples) if (s.mps > peak.mps) peak = s;
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * samples.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / n));
    const slice = samples.slice(from, to);
    bars.push(slice.reduce((s, x) => s + x.mps, 0) / slice.length); // mean, so one jumpy fix does not spike a bar
  }
  const top = Math.max(...bars, 1e-9);
  return {
    bars: bars.map((mps) => ({ mps, frac: mps / top, hot: mps >= top * 0.88 })),
    peakMps: peak.mps,
    peakAt: peak.t,
  };
}
