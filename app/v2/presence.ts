// app/v2/presence.ts
//
// Live positions of the other riders in a group ride. Presence is only for drawing the map:
// it is never stored and never used for stats (every rider's own recorded ride is the truth).
// One manager per group ride. It rejoins the room after every reconnect, ignores out-of-order
// updates, drops riders that go silent, and sends our own position at most once per second.

export interface PresenceSocket {
  connected: boolean;
  emit(event: string, payload?: unknown, ack?: (res: any) => void): unknown;
  on(event: string, fn: (...args: any[]) => void): unknown;
  off(event: string, fn?: (...args: any[]) => void): unknown;
  disconnect(): unknown;
}

export interface RiderPosition {
  userId: string;
  displayName: string | null;
  lat: number;
  lng: number;
  speedMps: number | null;
  heading: number | null;
  /** How far the rider has gone, for ordering the group. */
  distanceM: number | null;
  /** Last time they were seen moving, so "stopped for 3 min" can be shown. */
  lastMovedAt: number;
  t: number;
  receivedAt: number;
}

export interface PresenceOptions {
  socket: PresenceSocket;
  groupRideId: string;
  selfUserId: string;
  now?: () => number;
  onChange?: (riders: RiderPosition[]) => void;
  staleAfterMs?: number;
  sendIntervalMs?: number;
}

export function createPresence(opts: PresenceOptions) {
  const { socket, groupRideId, selfUserId } = opts;
  const now = opts.now ?? Date.now;
  const staleAfterMs = opts.staleAfterMs ?? 60_000;
  const sendIntervalMs = opts.sendIntervalMs ?? 1000;
  const riders = new Map<string, RiderPosition>();
  let lastSent = 0;
  let disposed = false;

  const snapshot = () => {
    const cutoff = now() - staleAfterMs;
    return [...riders.values()].filter((r) => r.receivedAt >= cutoff);
  };
  const changed = () => opts.onChange?.(snapshot());

  const accept = (p: any) => {
    if (!p || p.groupRideId !== groupRideId || p.userId === selfUserId) return;
    const prev = riders.get(p.userId);
    if (prev && p.t < prev.t) return; // arrived late, a newer position is already drawn
    riders.set(p.userId, {
      userId: p.userId,
      displayName: p.displayName ?? null,
      lat: p.lat,
      lng: p.lng,
      speedMps: p.speedMps ?? null,
      heading: p.heading ?? null,
      distanceM: p.distanceM ?? null,
      lastMovedAt: p.speedMps == null || p.speedMps >= 1 || !prev ? now() : prev.lastMovedAt,
      t: p.t,
      receivedAt: now(),
    });
  };

  const join = () => socket.emit('gr:join', { groupRideId }, (res: any) => {
    if (res && res.ok === false) console.warn('[presence] join refused:', res.error);
  });

  const onConnect = () => join(); // runs on first connect and after every reconnect
  const onSnapshot = (s: any) => {
    if (!s || s.groupRideId !== groupRideId) return;
    for (const p of s.positions ?? []) accept({ ...p, groupRideId });
    changed();
  };
  const onPos = (p: any) => { accept(p); changed(); };
  const onOffline = (p: any) => {
    if (p?.groupRideId === groupRideId && riders.delete(p.userId)) changed();
  };

  socket.on('connect', onConnect);
  socket.on('gr:snapshot', onSnapshot);
  socket.on('gr:pos', onPos);
  socket.on('gr:offline', onOffline);
  if (socket.connected) join();

  return {
    riders: snapshot,
    /** Send our own position. Dropped silently when offline or too soon after the last one. */
    sendPosition(p: { lat: number; lng: number; speedMps?: number | null; heading?: number | null; distanceM?: number | null; t?: number }) {
      if (disposed || !socket.connected) return false;
      const t = now();
      if (t - lastSent < sendIntervalMs) return false;
      lastSent = t;
      socket.emit('gr:pos', { groupRideId, lat: p.lat, lng: p.lng, speedMps: p.speedMps ?? undefined, heading: p.heading ?? undefined, distanceM: p.distanceM ?? undefined, t: p.t ?? t });
      return true;
    },
    /** Drop riders who went silent. Call on a timer. */
    prune() {
      const before = riders.size;
      const cutoff = now() - staleAfterMs;
      for (const [id, r] of riders) if (r.receivedAt < cutoff) riders.delete(id);
      if (riders.size !== before) changed();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      socket.off('connect', onConnect);
      socket.off('gr:snapshot', onSnapshot);
      socket.off('gr:pos', onPos);
      socket.off('gr:offline', onOffline);
      if (socket.connected) socket.emit('gr:leave', { groupRideId });
      socket.disconnect();
      riders.clear();
    },
  };
}

export type Presence = ReturnType<typeof createPresence>;
