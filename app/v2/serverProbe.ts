// app/v2/serverProbe.ts
//
// Does the server we talk to have the v2 API yet? The app can be released before the server (or
// the server can be mid-deploy), and in that window the app must not go blank: it shows the data
// the old API still provides, keeps recording rides, and uploads them as soon as v2 appears.
// Pure state machine; the runtime feeds it the result of GET /v2/config.

export type ProbeState = 'unknown' | 'available' | 'missing';

export interface ProbeResult { status?: number; ok: boolean }

/** Map one /config attempt to a state. Network errors say nothing about the server's version. */
export function classifyProbe(prev: ProbeState, r: ProbeResult): ProbeState {
  if (r.ok) return 'available';
  if (r.status === 404 || r.status === 405) return 'missing';
  return prev; // offline, timeout or 5xx: keep believing what we last knew
}

export function createProbe(opts: { onAvailable?: () => void; onChange?: (s: ProbeState) => void } = {}) {
  let state: ProbeState = 'unknown';
  const listeners = new Set<(s: ProbeState) => void>();
  return {
    get state() { return state; },
    /** Feed a result. Returns the new state; fires onAvailable on every missing/unknown -> available change. */
    record(r: ProbeResult): ProbeState {
      const next = classifyProbe(state, r);
      if (next !== state) {
        const was = state;
        state = next;
        listeners.forEach((fn) => fn(state));
        opts.onChange?.(state);
        if (state === 'available' && was !== 'available') opts.onAvailable?.();
      }
      return state;
    },
    subscribe(fn: (s: ProbeState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
