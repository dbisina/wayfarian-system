// app/v2/navigation.ts
// Turn-by-turn guidance: the route, its steps, which step the rider is on, and whether they have
// left the route. Routes come from our server, which asks Google's Routes API. Guidance only; it
// never affects recorded stats.

import { decodePolyline, type LatLng } from '../services/directions';
import { apiRequest } from '../services/api';

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

export function haversineM(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const travelModeFor = (vehicleType?: string): 'driving' | 'bicycling' | 'walking' => {
  const t = String(vehicleType ?? '').toLowerCase();
  if (t.includes('cycl') || t === 'bicycle' || t === 'bike' || t === 'cycle') return 'bicycling';
  if (t.includes('walk') || t.includes('run')) return 'walking';
  return 'driving';
};

/** The shape our server returns for a route: Routes API data with steps, maneuvers and polylines. */
export interface ServerRoute {
  distance?: { value?: number };
  duration?: { value?: number };
  polyline?: string;
  steps?: {
    instruction?: string;
    maneuver?: string | null;
    distance?: { value?: number };
    polyline?: string;
    endLocation?: { lat: number; lng: number } | null;
  }[];
}

/** Pure: turns the server's route into the app's. Returns null if it has no usable steps. */
export function toNavRoute(dir: ServerRoute | null | undefined): NavRoute | null {
  if (!dir || !Array.isArray(dir.steps) || !dir.steps.length) return null;
  const coordinates: LatLng[] = [];
  const steps: NavStep[] = [];
  for (const s of dir.steps) {
    if (s.polyline) coordinates.push(...decodePolyline(s.polyline));
    if (!s.endLocation) continue;
    steps.push({
      // The first line is the instruction; later lines are extra notes such as "Pass by ...".
      instruction: String(s.instruction || '').split('\n')[0].trim(),
      maneuver: s.maneuver ?? null,
      distanceM: s.distance?.value ?? 0,
      end: { latitude: s.endLocation.lat, longitude: s.endLocation.lng },
    });
  }
  if (!coordinates.length && dir.polyline) coordinates.push(...decodePolyline(dir.polyline));
  if (!coordinates.length || !steps.length) return null;
  return { coordinates, steps, distanceM: dir.distance?.value ?? 0, durationS: dir.duration?.value ?? 0 };
}

/** Fetches a route with its turn steps. Returns null with no network or no route. */
export async function fetchNavRoute(origin: LatLng, dest: LatLng, vehicleType?: string): Promise<NavRoute | null> {
  try {
    const q = new URLSearchParams({
      origin_lat: String(origin.latitude),
      origin_lng: String(origin.longitude),
      dest_lat: String(dest.latitude),
      dest_lng: String(dest.longitude),
      mode: travelModeFor(vehicleType),
    });
    const res = await apiRequest(`/maps/directions?${q.toString()}`, 'GET');
    return toNavRoute(res?.directions);
  } catch {
    return null;
  }
}

/** Distance from a position to the nearest point of the route, in metres. */
export function distanceFromRouteM(pos: LatLng, coordinates: LatLng[]): number {
  let best = Infinity;
  for (const c of coordinates) {
    const d = haversineM(pos, c);
    if (d < best) best = d;
  }
  return best;
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

/** Accepts the Routes API names (TURN_SLIGHT_LEFT, UTURN_RIGHT, FORK_LEFT, RAMP_RIGHT, ...). */
export function turnKind(maneuver: string | null): TurnKind {
  const m = (maneuver ?? '').toLowerCase().replace(/_/g, '-');
  if (m.includes('uturn')) return 'uturn';
  if (m.includes('slight-left') || m === 'fork-left' || m === 'ramp-left') return 'slight-left';
  if (m.includes('slight-right') || m === 'fork-right' || m === 'ramp-right') return 'slight-right';
  if (m.includes('left')) return 'left';
  if (m.includes('right')) return 'right';
  return 'straight';
}
