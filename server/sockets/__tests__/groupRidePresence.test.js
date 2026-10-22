const { createGroupRidePresence, MIN_INTERVAL_MS, STALE_AFTER_MS } = require('../groupRidePresence');

function fakeSocket(userId, io) {
  const handlers = {};
  const sock = {
    userId,
    userInfo: { displayName: userId },
    rooms: new Set(),
    emitted: [],
    handlers,
    on: (e, fn) => { handlers[e] = fn; },
    join(r) { this.rooms.add(r); io.rooms.get(r) ? io.rooms.get(r).add(this) : io.rooms.set(r, new Set([this])); },
    leave(r) { this.rooms.delete(r); io.rooms.get(r)?.delete(this); },
    emit(e, p) { this.emitted.push([e, p]); },
    to(r) { return { emit: (e, p) => io.rooms.get(r)?.forEach((s) => s !== sock && s.emit(e, p)) }; },
  };
  return sock;
}

describe('group ride presence', () => {
  let clock, io, attach, groupRides;
  const connect = (userId) => { const s = fakeSocket(userId, io); attach(io, s); return s; };
  const call = (s, ev, data) => new Promise((res) => { const r = s.handlers[ev](data, res); if (r && r.then) r.catch(() => res({ ok: false })); });

  beforeEach(() => {
    clock = 1_000_000;
    io = { rooms: new Map() };
    groupRides = { isActiveParticipant: jest.fn(async (u, g) => g === 'ride-1' && ['a', 'b'].includes(u)) };
    attach = createGroupRidePresence({ groupRides, now: () => clock });
  });

  test('only active participants can join', async () => {
    const outsider = connect('x');
    expect(await call(outsider, 'gr:join', { groupRideId: 'ride-1' })).toEqual({ ok: false, error: 'forbidden' });
    const a = connect('a');
    expect(await call(a, 'gr:join', { groupRideId: 'ride-1' })).toEqual({ ok: true });
    expect(a.emitted[0][0]).toBe('gr:snapshot');
  });

  test('positions relay to others, never back to the sender, and need a joined room', async () => {
    const a = connect('a'); const b = connect('b');
    await call(a, 'gr:join', { groupRideId: 'ride-1' });
    await call(b, 'gr:join', { groupRideId: 'ride-1' });
    expect(await call(a, 'gr:pos', { groupRideId: 'ride-2', lat: 1, lng: 1 })).toEqual({ ok: false, error: 'not_joined' });
    expect(await call(a, 'gr:pos', { groupRideId: 'ride-1', lat: 99, lng: 1 })).toEqual({ ok: false, error: 'invalid_position' });
    expect(await call(a, 'gr:pos', { groupRideId: 'ride-1', lat: 6.45, lng: 3.4, speedMps: 12, distanceM: 5400 })).toEqual({ ok: true });
    expect(b.emitted.filter(([e]) => e === 'gr:pos')).toHaveLength(1);
    expect(a.emitted.filter(([e]) => e === 'gr:pos')).toHaveLength(0);
    expect(b.emitted.find(([e]) => e === 'gr:pos')[1]).toMatchObject({ userId: 'a', lat: 6.45, speedMps: 12, distanceM: 5400 });
  });

  test('rate limited per rider', async () => {
    const a = connect('a');
    await call(a, 'gr:join', { groupRideId: 'ride-1' });
    expect((await call(a, 'gr:pos', { groupRideId: 'ride-1', lat: 1, lng: 1 })).dropped).toBeUndefined();
    expect((await call(a, 'gr:pos', { groupRideId: 'ride-1', lat: 1, lng: 1 })).dropped).toBe(true);
    clock += MIN_INTERVAL_MS + 1;
    expect((await call(a, 'gr:pos', { groupRideId: 'ride-1', lat: 1, lng: 1 })).dropped).toBeUndefined();
  });

  test('late joiners get a snapshot without stale riders; disconnect announces offline', async () => {
    const a = connect('a'); const b = connect('b');
    await call(a, 'gr:join', { groupRideId: 'ride-1' });
    await call(b, 'gr:join', { groupRideId: 'ride-1' });
    await call(a, 'gr:pos', { groupRideId: 'ride-1', lat: 1, lng: 1 });
    clock += STALE_AFTER_MS + 1;
    await call(b, 'gr:pos', { groupRideId: 'ride-1', lat: 2, lng: 2 });

    const late = connect('a'); // same user, fresh socket
    await call(late, 'gr:join', { groupRideId: 'ride-1' });
    const snap = late.emitted.find(([e]) => e === 'gr:snapshot')[1].positions;
    expect(snap.map((p) => p.userId)).toEqual(['b']); // a's position is stale

    b.handlers.disconnect();
    expect(late.emitted.some(([e, p]) => e === 'gr:offline' && p.userId === 'b')).toBe(true);
  });
});
