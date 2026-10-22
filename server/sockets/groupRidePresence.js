// server/sockets/groupRidePresence.js
//
// v2 group ride presence. Live positions are ephemeral: held in memory, relayed to the group
// room, never written to the database and never used for stats (each rider's own recorded
// ride is the source of truth). Only active participants of a group ride may join its room.
//
// Client -> server: gr:join {groupRideId}, gr:leave {groupRideId}, gr:pos {groupRideId, lat, lng, ...}
// Server -> client: gr:snapshot, gr:pos, gr:offline

const MIN_INTERVAL_MS = 900; // one position per second per rider is plenty for a map
const STALE_AFTER_MS = 60 * 1000;
const room = (id) => `gr-${id}`;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const validPos = (p) =>
  p && finite(p.lat) && finite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;

/**
 * @param {{ groupRides: { isActiveParticipant(userId: string, groupRideId: string): Promise<boolean> }, now?: () => number }} deps
 * @returns {(io: any, socket: any) => void} socket handler
 */
function createGroupRidePresence({ groupRides, now = Date.now }) {
  // groupRideId -> Map<userId, latest position>
  const positions = new Map();

  const snapshot = (groupRideId) => {
    const m = positions.get(groupRideId);
    if (!m) return [];
    const cutoff = now() - STALE_AFTER_MS;
    return [...m.values()].filter((p) => p.receivedAt >= cutoff);
  };

  return function attach(io, socket) {
    const joined = new Set();
    let lastSentAt = 0;
    const ack = (cb, payload) => typeof cb === 'function' && cb(payload);

    socket.on('gr:join', async (data, cb) => {
      try {
        const id = data && data.groupRideId;
        if (!(await groupRides.isActiveParticipant(socket.userId, id))) return ack(cb, { ok: false, error: 'forbidden' });
        socket.join(room(id));
        joined.add(id);
        socket.emit('gr:snapshot', { groupRideId: id, positions: snapshot(id) });
        ack(cb, { ok: true });
      } catch {
        ack(cb, { ok: false, error: 'internal' });
      }
    });

    const leave = (id) => {
      if (!joined.delete(id)) return;
      socket.leave(room(id));
      const m = positions.get(id);
      if (m) {
        m.delete(socket.userId);
        if (m.size === 0) positions.delete(id);
      }
      socket.to(room(id)).emit('gr:offline', { groupRideId: id, userId: socket.userId });
    };

    socket.on('gr:leave', (data, cb) => {
      leave(data && data.groupRideId);
      ack(cb, { ok: true });
    });

    socket.on('gr:pos', (data, cb) => {
      const id = data && data.groupRideId;
      if (!joined.has(id)) return ack(cb, { ok: false, error: 'not_joined' });
      if (!validPos(data)) return ack(cb, { ok: false, error: 'invalid_position' });
      const t = now();
      if (t - lastSentAt < MIN_INTERVAL_MS) return ack(cb, { ok: true, dropped: true });
      lastSentAt = t;

      const pos = {
        userId: socket.userId,
        displayName: socket.userInfo?.displayName ?? null,
        lat: data.lat,
        lng: data.lng,
        speedMps: finite(data.speedMps) && data.speedMps >= 0 ? data.speedMps : null,
        heading: finite(data.heading) ? data.heading : null,
        // How far this rider has gone, so the group can show who is ahead and by how much.
        distanceM: finite(data.distanceM) && data.distanceM >= 0 ? data.distanceM : null,
        t: finite(data.t) ? data.t : t, // device time, so clients can drop out-of-order updates
        receivedAt: t,
      };
      if (!positions.has(id)) positions.set(id, new Map());
      positions.get(id).set(socket.userId, pos);
      socket.to(room(id)).emit('gr:pos', { groupRideId: id, ...pos });
      ack(cb, { ok: true });
    });

    socket.on('disconnect', () => {
      for (const id of [...joined]) leave(id);
    });
  };
}

module.exports = { createGroupRidePresence, MIN_INTERVAL_MS, STALE_AFTER_MS };
