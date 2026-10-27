// app/v2/mapCamera.ts
// Camera maths shared by the map screens.
//
// Why this exists: react-native-maps' camera `zoom` only works with Google Maps. On iOS the map is
// Apple Maps, which ignores it (it wants `altitude`), so animateCamera({ center, zoom }) moved the
// map to the rider but left it zoomed out over the whole country. A region (centre plus span in
// degrees) works the same on both, so zooming in goes through one.

export interface LatLng { latitude: number; longitude: number }
export interface MapRegion extends LatLng { latitudeDelta: number; longitudeDelta: number }

/** Degrees of latitude shown at a Google-style zoom level. Zoom 16 is a street-level 0.01°; each level halves it. */
export const zoomToDelta = (zoom: number): number => 0.01 * 2 ** (16 - zoom);

/** A region centred on a point at a given zoom level, usable on Apple Maps and Google Maps. */
export const regionAt = (latitude: number, longitude: number, zoom: number): MapRegion => {
  const delta = zoomToDelta(zoom);
  return { latitude, longitude, latitudeDelta: delta, longitudeDelta: delta };
};

/** Compass bearing from `a` to `b` in degrees (0 = north, 90 = east). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * rad;
  const y = Math.sin(dLng) * Math.cos(b.latitude * rad);
  const x = Math.cos(a.latitude * rad) * Math.sin(b.latitude * rad) - Math.sin(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.cos(dLng);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
