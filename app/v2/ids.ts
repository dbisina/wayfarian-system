// app/v2/ids.ts
// Rides carried over from the old system keep their old id inside the new one:
// "lj_<old journey id>" for a solo journey, "li_<old instance id>" for a group ride a rider took part in.

/** The old journey id for a carried-over solo ride, or null for anything else. */
export function legacyJourneyIdOf(rideId: string | undefined | null): string | null {
  const m = rideId ? /^lj_(.+)$/.exec(rideId) : null;
  return m ? m[1] : null;
}

/** Where to open a ride from a list: old solo journeys keep their full old screen, everything else uses the ride screen. */
export function detailRouteFor(rideId: string): { pathname: '/journey-detail'; params: { journeyId: string } } | { pathname: '/ride-detail'; params: { rideId: string } } {
  const legacy = legacyJourneyIdOf(rideId);
  return legacy ? { pathname: '/journey-detail', params: { journeyId: legacy } } : { pathname: '/ride-detail', params: { rideId } };
}
