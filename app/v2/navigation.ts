// app/v2/navigation.ts
// Turn-by-turn guidance on top of the Google Directions API: the route, its steps, which step the
// rider is on, and whether they have left the route. Guidance only; it never affects recorded stats.

import { decodePolyline, getGoogleMapsApiKey, type LatLng } from '../services/directions';

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

const stripHtml = (s: string) =>
  s.replace(/<div[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export const travelModeFor = (vehicleType?: string): 'driving' | 'bicycling' | 'walking' => {
  const t = String(vehicleType ?? '').toLowerCase();
  if (t.includes('cycl') || t === 'bicycle' || t === 'bike' || t === 'cycle') return 'bicycling';
  if (t.includes('walk') || t.includes('run')) return 'walking';
  return 'driving';
};

/** Fetches a route with its turn steps. Returns null with no key, no network or no route. */
export async function fetchNavRoute(origin: LatLng, dest: LatLng, vehicleType?: string): Promise<NavRoute | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${dest.latitude},${dest.longitude}&mode=${travelModeFor(vehicleType)}&key=${key}`;
  try {
    const json = await (await fetch(url)).json();
    if (json.status !== 'OK' || !json.routes?.length) return null;
    const leg = json.routes[0].legs?.[0];
    if (!leg) return null;
    const coordinates: LatLng[] = [];
    const steps: NavStep[] = [];
    for (const s of leg.steps ?? []) {
      if (s.polyline?.points) coordinates.push(...decodePolyline(s.polyline.points));
      steps.push({
        instruction: stripHtml(s.html_instructions ?? ''),
        maneuver: s.maneuver ?? null,
        distanceM: s.distance?.value ?? 0,
        end: { latitude: s.end_location.lat, longitude: s.end_location.lng },
      });
    }
    if (!coordinates.length || !steps.length) return null;
    return { coordinates, steps, distanceM: leg.distance?.value ?? 0, durationS: leg.duration?.value ?? 0 };
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

export function turnKind(maneuver: string | null): TurnKind {
  const m = maneuver ?? '';
  if (m.includes('uturn')) return 'uturn';
  if (m.includes('slight-left') || m === 'fork-left' || m === 'ramp-left') return 'slight-left';
  if (m.includes('slight-right') || m === 'fork-right' || m === 'ramp-right') return 'slight-right';
  if (m.includes('left')) return 'left';
  if (m.includes('right')) return 'right';
  return 'straight';
}
