// app/v2/route.ts
// Fit a recorded route into a square box for drawing.

export const ROUTE_BOX = 320;
const SIZE = ROUTE_BOX;
const PAD = 16;

/** Fit lat/lng into the box, keeping the aspect ratio (longitude is shrunk by cos(latitude)). */
/** Each segment becomes its own polyline, so a pause shows as a gap rather than a straight line. */
export function projectRoute(points: { segment: number; lat: number; lng: number }[]): string[] {
  if (points.length < 2) return [];
  const midLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * kx);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const scale = (SIZE - PAD * 2) / span;
  const ox = (SIZE - (maxX - minX) * scale) / 2;
  const oy = (SIZE - (maxY - minY) * scale) / 2;
  const lines = new Map<number, string[]>();
  points.forEach((p, i) => {
    const x = ox + (xs[i] - minX) * scale;
    const y = SIZE - (oy + (ys[i] - minY) * scale);
    if (!lines.has(p.segment)) lines.set(p.segment, []);
    lines.get(p.segment)!.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return [...lines.values()].filter((l) => l.length > 1).map((l) => l.join(' '));
}

