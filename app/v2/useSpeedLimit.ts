// app/v2/useSpeedLimit.ts
// The posted speed limit for the sign on the live-ride screen. While navigating, the current route
// step's limit wins; otherwise the server is asked, at most every 20 s or 150 m. Unknown means null
// and the sign stays hidden. Guidance only: it never touches recorded stats.

import { useEffect, useRef, useState } from 'react';
import { placesAPI } from '../services/api';
import { pickDisplayLimit, shouldLookUp, type SpeedLimitState } from './speedLimit';

export function useSpeedLimit(
  here: { latitude: number; longitude: number } | null,
  routeKmh: number | null | undefined,
  active: boolean
): number | null {
  const [lookupKmh, setLookupKmh] = useState<number | null>(null);
  const state = useRef<SpeedLimitState>({ at: null, t: 0 });
  const inflight = useRef(false);
  const lat = here?.latitude;
  const lng = here?.longitude;

  useEffect(() => {
    if (!active || lat == null || lng == null || inflight.current) return;
    const pos = { latitude: lat, longitude: lng };
    const now = Date.now();
    if (!shouldLookUp(state.current, pos, now)) return;
    state.current = { at: pos, t: now };
    inflight.current = true;
    placesAPI
      .speedLimit(lat, lng)
      .then((res) => setLookupKmh(res?.kmh ?? null))
      .catch(() => { /* no network or server trouble: keep the last answer and try again later */ })
      .finally(() => { inflight.current = false; });
  }, [active, lat, lng]);

  return pickDisplayLimit(routeKmh, lookupKmh);
}
