// app/services/directions.ts
// Fetch directions via Google Directions API and decode overview polyline
import Constants from 'expo-constants';

export type LatLng = { latitude: number; longitude: number };

export interface DirectionsResult {
  coordinates: LatLng[];
  distanceMeters?: number;
  durationSeconds?: number;
}

// Resolve a Google Maps API key to use across SDK and Directions API calls.
// Priority:
// 1) EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (preferred for client usage in Expo)
// 2) GOOGLE_MAPS_API_KEY (fallback env)
// 3) expoConfig.extra.googleMapsApiKey (manual extra)
// 4) expoConfig.ios.config.googleMapsApiKey (native iOS Maps SDK key)
// 5) expoConfig.android.config.googleMaps.apiKey (native Android Maps SDK key)
export function getGoogleMapsApiKey(): string | undefined {
  const envPublic = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
  const envGeneric = process.env.GOOGLE_MAPS_API_KEY as string | undefined;
  const expoConfig: any = (Constants as any)?.expoConfig || {};
  const extra = expoConfig?.extra?.googleMapsApiKey as string | undefined;
  const iosKey = expoConfig?.ios?.config?.googleMapsApiKey as string | undefined;
  const androidKey = expoConfig?.android?.config?.googleMaps?.apiKey as string | undefined;
  return envPublic || envGeneric || extra || iosKey || androidKey;
}

// Decode an encoded polyline string to LatLng[]
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const path: LatLng[] = [];

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    path.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return path;
}

export async function fetchDirections(
  origin: LatLng,
  destination: LatLng,
  options?: { mode?: 'driving' | 'walking' | 'bicycling' | 'transit'; apiKey?: string }
): Promise<DirectionsResult | null> {
  const mode = options?.mode || 'driving';
  const key = options?.apiKey || getGoogleMapsApiKey();
  if (!key) {
    console.warn('No Google Maps API key available for directions');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=${mode}&key=${key}`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK' || !json.routes || json.routes.length === 0) {
      console.warn('Directions API error:', json.status, json.error_message);
      return null;
    }
    const route = json.routes[0];
    const overview = route.overview_polyline?.points as string | undefined;
    const legs = route.legs?.[0];
    const distanceMeters = legs?.distance?.value as number | undefined;
    const durationSeconds = legs?.duration?.value as number | undefined;

    if (!overview) return null;
    const coordinates = decodePolyline(overview);
    return { coordinates, distanceMeters, durationSeconds };
  } catch (err) {
    console.warn('Directions fetch failed:', err);
    return null;
  }
}
