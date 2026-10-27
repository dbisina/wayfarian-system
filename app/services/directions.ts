// app/services/directions.ts
import Constants from 'expo-constants';

export type LatLng = { latitude: number; longitude: number };

/**
 * Resolves a Google Maps API key from the available configuration sources.
 *
 * Priority order (highest to lowest):
 * 1. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — preferred for Expo client usage
 * 2. `GOOGLE_MAPS_API_KEY` — generic env fallback
 * 3. `expoConfig.extra.googleMapsApiKey` — manual extra field in app.config
 * 4. `expoConfig.ios.config.googleMapsApiKey` — native iOS Maps SDK key
 * 5. `expoConfig.android.config.googleMaps.apiKey` — native Android Maps SDK key
 *
 * @returns The first non-empty key found, or `undefined` if none is configured.
 */
export function getGoogleMapsApiKey(): string | undefined {
  const envPublic = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
  const envGeneric = process.env.GOOGLE_MAPS_API_KEY as string | undefined;
  const expoConfig: any = (Constants as any)?.expoConfig || {};
  const extra = expoConfig?.extra?.googleMapsApiKey as string | undefined;
  const iosKey = expoConfig?.ios?.config?.googleMapsApiKey as string | undefined;
  const androidKey = expoConfig?.android?.config?.googleMaps?.apiKey as string | undefined;
  return envPublic || envGeneric || extra || iosKey || androidKey;
}

/**
 * Decodes a Google Maps encoded polyline string into an array of coordinates.
 *
 * Implements the algorithm described at:
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * @param encoded - The encoded polyline string from a Directions API response.
 * @returns Array of `LatLng` points along the path.
 */
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
