// app/v2/countryRegion.ts
//
// Where the map should open when there is no GPS fix yet (permission pending, slow first fix, or
// denied). It must be where the rider actually is, never an arbitrary city: we use their profile
// country, then the country the phone is set to, then a plain world view.

export interface MapRegion { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }

// [latitude, longitude, how many degrees of latitude fit the whole country]
const CENTROIDS: Record<string, [number, number, number]> = {
  // Africa
  NG: [9.08, 8.68, 9], GH: [7.95, -1.02, 5], KE: [0.02, 37.9, 7], ZA: [-30.56, 22.94, 12], EG: [26.8, 30.8, 10],
  MA: [31.8, -7.1, 7], ET: [9.1, 40.5, 9], TZ: [-6.4, 34.9, 9], UG: [1.37, 32.29, 5], DZ: [28, 1.6, 14],
  CM: [7.4, 12.4, 8], CI: [7.5, -5.5, 6], SN: [14.5, -14.5, 5], ZW: [-19, 29.9, 5], ZM: [-13.1, 27.8, 8],
  AO: [-11.2, 17.9, 11], RW: [-1.94, 29.87, 2.5], TN: [34, 9.5, 5], NA: [-22.6, 17.1, 10], BW: [-22.3, 24.7, 7],
  // Americas
  US: [39.8, -98.6, 40], CA: [56.1, -106.3, 45], MX: [23.6, -102.5, 22], BR: [-14.2, -51.9, 40], AR: [-38.4, -63.6, 35],
  CL: [-35.7, -71.5, 30], CO: [4.6, -74.1, 13], PE: [-9.2, -75, 17], VE: [6.4, -66.6, 12], EC: [-1.8, -78.2, 6],
  JM: [18.1, -77.3, 3], TT: [10.7, -61.2, 1.5], DO: [18.9, -70.2, 3], CR: [9.9, -84.2, 3], PA: [8.5, -80.8, 3],
  // Europe
  GB: [54.3, -2.5, 10], IE: [53.4, -8.2, 5], FR: [46.6, 2.2, 10], DE: [51.2, 10.4, 8], ES: [40.4, -3.7, 10],
  PT: [39.4, -8.2, 5], IT: [42.8, 12.6, 10], NL: [52.1, 5.3, 3.5], BE: [50.5, 4.5, 3], CH: [46.8, 8.2, 3],
  AT: [47.5, 14.5, 4], SE: [62, 15, 16], NO: [64.5, 11.5, 18], DK: [56.2, 9.5, 5], FI: [64.5, 26, 14],
  PL: [52, 19.4, 7], CZ: [49.8, 15.5, 4], GR: [39, 22, 7], TR: [39, 35, 13], UA: [49, 32, 11],
  RO: [45.9, 25, 6], HU: [47.2, 19.5, 4], RU: [61.5, 100, 70],
  // Asia and Middle East
  IN: [22.6, 79, 28], PK: [30.4, 69.3, 15], BD: [23.7, 90.4, 5], CN: [35.9, 104.2, 40], JP: [36.2, 138.3, 14],
  KR: [36.5, 127.9, 5], ID: [-2.5, 118, 30], PH: [12.9, 121.8, 14], VN: [14, 108.3, 14], TH: [15.9, 101, 11],
  MY: [4.2, 102, 9], SG: [1.35, 103.82, 0.3], AE: [24, 54, 5], SA: [23.9, 45.1, 18], IL: [31, 35, 3],
  QA: [25.3, 51.2, 1.5], LK: [7.9, 80.8, 4], NP: [28.4, 84.1, 5],
  // Oceania
  AU: [-25.7, 134.5, 40], NZ: [-41, 174, 15],
};

/** Everything, centred roughly on the Atlantic, so no single place is implied. */
export const WORLD_REGION: MapRegion = { latitude: 15, longitude: 10, latitudeDelta: 120, longitudeDelta: 90 };

const regionFor = (lat: number, lng: number, latDelta: number): MapRegion => ({
  latitude: lat,
  longitude: lng,
  latitudeDelta: latDelta,
  longitudeDelta: latDelta * 0.6, // the map is taller than it is wide
});

export function regionForCountry(code?: string | null): MapRegion | null {
  if (!code) return null;
  const c = CENTROIDS[String(code).trim().toUpperCase()];
  return c ? regionFor(c[0], c[1], c[2]) : null;
}

/**
 * The region to show before a GPS fix: the profile country first (that is where the rider says
 * they ride), then the phone's region, then the world. Never a hard-coded city.
 */
export function fallbackRegion(opts: { profileCountryCode?: string | null; deviceRegionCode?: string | null }): MapRegion {
  return regionForCountry(opts.profileCountryCode) ?? regionForCountry(opts.deviceRegionCode) ?? WORLD_REGION;
}

export const hasCountry = (code?: string | null) => regionForCountry(code) !== null;
