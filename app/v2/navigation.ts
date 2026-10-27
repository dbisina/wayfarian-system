// app/v2/navigation.ts
// Turn-by-turn guidance: the route, its steps, which step the rider is on, how far is left along the
// road, and whether they have left the route. Routes come from our server, which picks the provider,
// so no map API key ships in the app. Guidance only; it never affects recorded stats.

import { decodePolyline, type LatLng } from '../services/directions';
import { placesAPI } from '../services/api';

export interface NavStep {
  instruction: string;
  maneuver: string | null;
  distanceM: number;
  /** Where this step ends, which is where the next turn happens. */
  end: LatLng;
}

export interface NavRoute {
  coordinates: LatLng[];
  steps: NavStep[];
  distanceM: number;
  durationS: number;
}

export type TravelMode = 'driving' | 'motorcycle' | 'bicycling' | 'walking';

export function haversineM(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const travelModeFor = (vehicleType?: string): TravelMode => {
  const t = String(vehicleType ?? '').toLowerCase();
  // "motorcycle" contains "cycl", so motor vehicles are matched first.
  if (t.includes('motor') || t.includes('scooter') || t.includes('moped') || t === 'okada') return 'motorcycle';
  if (t.includes('cycl') || t.includes('bike')) return 'bicycling';
  if (t.includes('walk') || t.includes('run') || t.includes('hike')) return 'walking';
  return 'driving';
};

/** Fetches a route with its turn steps. Returns null with no network or no route. */
export async function fetchNavRoute(origin: LatLng, dest: LatLng, vehicleType?: string): Promise<NavRoute | null> {
  try {
    const res: any = await placesAPI.directions({
      origin_lat: origin.latitude,
      origin_lng: origin.longitude,
      dest_lat: dest.latitude,
      dest_lng: dest.longitude,
      mode: travelModeFor(vehicleType),
    });
    const r = res?.directions;
    if (!r?.polyline) return null;
    const coordinates = decodePolyline(r.polyline);
    const steps: NavStep[] = (r.steps ?? [])
      .filter((s: any) => s?.end && Number.isFinite(s.end.latitude) && Number.isFinite(s.end.longitude))
      .map((s: any) => ({ instruction: s.instruction ?? '', maneuver: s.maneuver ?? null, distanceM: s.distanceM ?? 0, end: s.end }));
    if (coordinates.length < 2 || !steps.length) return null;
    return { coordinates, steps, distanceM: r.distance?.value ?? 0, durationS: r.duration?.value ?? 0 };
  } catch {
    return null;
  }
}

/** Where a position sits on the route: distance off it, and which segment it is nearest to. */
export interface RoutePosition {
  offRouteM: number;
  /** Index of the segment start (coordinates[i] → coordinates[i + 1]). */
  segment: number;
  /** Fraction along that segment, 0..1. */
  t: number;
}

/**
 * Projects `pos` onto the route line (not just its vertices), on a local flat-earth approximation,
 * which is accurate to well under a metre over a route segment's length.
 */
export function locateOnRoute(pos: LatLng, coordinates: LatLng[]): RoutePosition {
  const kx = 111320 * Math.cos((pos.latitude * Math.PI) / 180);
  const ky = 110540;
  let best: RoutePosition = { offRouteM: Infinity, segment: 0, t: 0 };
  if (coordinates.length === 1) return { offRouteM: haversineM(pos, coordinates[0]), segment: 0, t: 0 };
  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const ax = (a.longitude - pos.longitude) * kx;
    const ay = (a.latitude - pos.latitude) * ky;
    const dx = (b.longitude - a.longitude) * kx;
    const dy = (b.latitude - a.latitude) * ky;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (d < best.offRouteM) best = { offRouteM: d, segment: i, t };
  }
  return best;
}

/** Distance from a position to the nearest point of the route line, in metres. */
export function distanceFromRouteM(pos: LatLng, coordinates: LatLng[]): number {
  return locateOnRoute(pos, coordinates).offRouteM;
}

/** Road distance left from a located position to the end of the route, in metres. */
export function remainingRouteM(at: RoutePosition, coordinates: LatLng[]): number {
  if (coordinates.length < 2) return 0;
  const i = Math.min(at.segment, coordinates.length - 2);
  let m = haversineM(coordinates[i], coordinates[i + 1]) * (1 - at.t);
  for (let j = i + 1; j < coordinates.length - 1; j++) m += haversineM(coordinates[j], coordinates[j + 1]);
  return m;
}

/**
 * The step the rider is on. A step is done once they are within `arriveM` of its end, so the index
 * only ever moves forward and a noisy fix cannot bring a finished turn back.
 */
export function advanceStep(pos: LatLng, steps: NavStep[], from: number, arriveM = 30): number {
  let i = from;
  while (i < steps.length - 1 && haversineM(pos, steps[i].end) <= arriveM) i++;
  return i;
}

export type TurnKind = 'left' | 'right' | 'slight-left' | 'slight-right' | 'uturn' | 'straight';

export function turnKind(maneuver: string | null): TurnKind {
  const m = maneuver ?? '';
  if (m.includes('uturn')) return 'uturn';
  if (m.includes('slight-left') || m === 'fork-left' || m === 'ramp-left') return 'slight-left';
  if (m.includes('slight-right') || m === 'fork-right' || m === 'ramp-right') return 'slight-right';
  if (m.includes('left')) return 'left';
  if (m.includes('right')) return 'right';
  return 'straight';
}
