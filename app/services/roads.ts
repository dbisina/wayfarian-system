// app/services/roads.ts
// Google Maps Roads API integration for snapping GPS points to legitimate roads

import { getGoogleMapsApiKey, LatLng } from './directions';

export interface SnappedPoint extends LatLng {
    placeId: string;
}

/**
 * Snaps a list of GPS coordinates to the nearest roads.
 * @param points Up to 100 coordinates to snap.
 * @param interpolate Whether to interpolate a path to include all points.
 * @returns Array of snapped coordinates with Place IDs.
 */
export async function snapToRoads(
    points: LatLng[],
    interpolate: boolean = true
): Promise<SnappedPoint[]> {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
        console.warn('[Roads] No Google Maps API key available');
        return [];
    }

    if (points.length === 0) return [];

    // Format: "lat1,lng1|lat2,lng2|..."
    const pathString = points
        .map((p) => `${p.latitude},${p.longitude}`)
        .join('|');

    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(
        pathString
    )}&interpolate=${interpolate}&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.snappedPoints) {
            return data.snappedPoints.map((p: any) => ({
                latitude: p.location.latitude,
                longitude: p.location.longitude,
                placeId: p.placeId,
            }));
        } else if (data.error) {
            console.warn('[Roads] API Error:', data.error.message || data.error);
        }
        return [];
    } catch (error) {
        console.error('[Roads] Network error:', error);
        return [];
    }
}

/**
 * Snaps a single point to the nearest road.
 * Useful for real-time immersive UI smoothing.
 */
export async function snapSinglePoint(point: LatLng): Promise<LatLng | null> {
    const snapped = await snapToRoads([point], false);
    if (snapped.length > 0) {
        return {
            latitude: snapped[0].latitude,
            longitude: snapped[0].longitude,
        };
    }
    return null;
}
