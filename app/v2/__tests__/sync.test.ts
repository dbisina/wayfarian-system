import { describe, expect, test } from 'vitest';
import { computeRideStats } from '@wayfarian/ride-core';
import { ApiError, createV2Client } from '../api';
import { MemoryOutboxStore, createSyncEngine, backoffMs } from '../outbox';
import { MemoryLocalRideStore, createRecorder } from '../recorder';

/** In-process stand-in for the server with the same idempotency rules as RideService. */
function fakeServer() {
  const rides = new Map<string, { points: Map<number, any>; events: Map<string, any>; finalized: number; deleted: boolean; group?: string }>();
  const log: string[] = [];
  let online = true;
  let failNext: ApiError | null = null;
  const guard = () => {
    if (!online) throw new ApiError(0, 'network', 'offline', { retryable: true });
    if (failNext) { const e = failNext; failNext = null; throw e; }
  };
  const get = (id: string) => {
    const r = rides.get(id);
    if (!r) throw new ApiError(404, 'not_found', 'Ride not found');
    if (r.deleted) throw new ApiError(409, 'conflict', 'Ride was deleted');
    return r;
  };
  return {
    rides, log,
    setOnline(v: boolean) { online = v; },
    failOnce(e: ApiError) { failNext = e; },
    client: {
      async upsertRide(id: string) { guard(); log.push(`upsert:${id}`); if (!rides.has(id)) rides.set(id, { points: new Map(), events: new Map(), finalized: 0, deleted: false }); },
      async startGroupMemberRide(g: string, id: string) { guard(); log.push(`group-upsert:${id}`); rides.set(id, { points: new Map(), events: new Map(), finalized: 0, deleted: false, group: g }); },
      async addPoints(id: string, pts: any[]) { guard(); const r = get(id); let accepted = 0; for (const p of pts) if (!r.points.has(p.seq)) { r.points.set(p.seq, p); accepted++; } log.push(`points:${id}:${pts.length}`); return { accepted, duplicates: pts.length - accepted }; },
      async addEvents(id: string, evs: any[]) { guard(); const r = get(id); for (const e of evs) r.events.set(e.id, e); log.push(`events:${id}`); },
      async finalizeRide(id: string) { guard(); const r = get(id); r.finalized++; log.push(`finalize:${id}`); return {}; },
      async deleteRide(id: string) { guard(); const r = rides.get(id); if (!r) throw new ApiError(404, 'not_found', 'x'); r.deleted = true; log.push(`delete:${id}`); },
    },
  };
}

const lng = (m: number) => 3.4 + m / (111320 * Math.cos((6.45 * Math.PI) / 180));
const fixAt = (t0: number, i: number, speed = 10) => ({ lat: 6.45, lng: lng(speed * i), t: t0 + i * 1000, accuracy: 5 });

function setup() {
  let clock = 1_000_000_000_000;
  const server = fakeServer();
  const outbox = new MemoryOutboxStore();
  const local = new MemoryLocalRideStore();
  const engine = createSyncEngine({ store: outbox, client: server.client as any, now: () => clock });
  let n = 0;
  const recorder = createRecorder({ local, outbox, newId: () => `ride-${String(++n).padStart(8, '0')}`, now: () => clock, kick: () => { void engine.drain(); }, flushEveryPoints: 20 });
  return { server, outbox, local, engine, recorder, tick: (ms: number) => { clock += ms; return clock; }, now: () => clock };
}

describe('offline-first recording', () => {
  test('a ride recorded offline uploads completely once the connection returns', async () => {
    const s = setup();
    s.server.setOnline(false);
    const t0 = s.now();
    const id = await s.recorder.start({ timezone: 'Africa/Lagos' });
    for (let i = 0; i <= 120; i++) { s.tick(1000); await s.recorder.addFix(fixAt(t0, i + 1)); }
    await s.recorder.end();
    await s.engine.drain();
    expect(s.server.rides.size).toBe(0);
    expect((await s.outbox.counts()).pending).toBeGreaterThan(3);

    s.server.setOnline(true);
    s.tick(10 * 60 * 1000); // past any backoff
    const state = await s.engine.drain();
    expect(state.pending).toBe(0);
    const r = s.server.rides.get(id)!;
    expect(r.points.size).toBe(121);
    expect(r.finalized).toBe(1);
    // finalize ran after all points and events, never before
    const order = s.server.log.filter((l) => l.endsWith(id) || l.includes(id + ':'));
    expect(order.indexOf(`finalize:${id}`)).toBe(order.length - 1);
  });

  test('live stats match what the server computes from the uploaded points', async () => {
    const s = setup();
    const t0 = s.now();
    const id = await s.recorder.start();
    let live;
    for (let i = 1; i <= 300; i++) { s.tick(1000); live = await s.recorder.addFix(fixAt(t0, i)); }
    await s.recorder.end();
    await s.engine.drain();
    const pts = [...s.server.rides.get(id)!.points.values()].sort((a, b) => a.seq - b.seq).map((p) => ({ lat: p.lat, lng: p.lng, t: Date.parse(p.t), accuracy: p.accuracy }));
    const serverStats = computeRideStats([pts]);
    expect(live!.distanceM).toBeCloseTo(serverStats.distanceM, 6);
    expect(live!.topSpeedMps).toBeCloseTo(serverStats.topSpeedMps, 6);
  });

  test('pause and resume start a new segment, so travel while paused is never counted', async () => {
    const s = setup();
    const t0 = s.now();
    await s.recorder.start();
    for (let i = 1; i <= 60; i++) { s.tick(1000); await s.recorder.addFix(fixAt(t0, i)); }
    const before = (await s.recorder.pause())!.distanceM;
    s.tick(30 * 60 * 1000); // paused for half an hour, rider moved 20 km meanwhile
    await s.recorder.resume();
    s.tick(1000);
    const after = await s.recorder.addFix({ lat: 6.45, lng: lng(20000), t: s.now(), accuracy: 5 });
    expect(after!.distanceM).toBeCloseTo(before, 3);
  });

  test('a ride survives the app being killed: restore continues it with nothing lost or double counted', async () => {
    const s = setup();
    const t0 = s.now();
    const id = await s.recorder.start();
    for (let i = 1; i <= 45; i++) { s.tick(1000); await s.recorder.addFix(fixAt(t0, i)); }

    // "kill": brand new recorder over the same local + outbox stores
    let n = 100;
    const reborn = createRecorder({ local: s.local, outbox: s.outbox, newId: () => `ride-${++n}xxxxxxxx`, now: s.now, kick: () => { void s.engine.drain(); }, flushEveryPoints: 20 });
    const restored = await reborn.restore();
    expect(restored!.rideId).toBe(id);
    for (let i = 46; i <= 90; i++) { s.tick(1000); await reborn.addFix(fixAt(t0, i)); }
    await reborn.end();
    await s.engine.drain();
    const r = s.server.rides.get(id)!;
    expect([...r.points.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i));
    expect(r.finalized).toBe(1);
  });

  test('duplicate and out-of-order fixes from the OS are ignored', async () => {
    const s = setup();
    const t0 = s.now();
    await s.recorder.start();
    await s.recorder.addFix(fixAt(t0, 1));
    await s.recorder.addFix(fixAt(t0, 1));
    await s.recorder.addFix(fixAt(t0, 0));
    expect((await s.local.pointsOf(s.recorder.currentRideId()!)).length).toBe(1);
  });
});

describe('sync engine', () => {
  test('replaying the same queue is a no-op on the server', async () => {
    const s = setup();
    const id = await s.recorder.start();
    for (let i = 1; i <= 25; i++) { s.tick(1000); await s.recorder.addFix(fixAt(s.now() - i * 1000, i)); }
    await s.recorder.end();
    await s.engine.drain();
    const first = s.server.rides.get(id)!.points.size;
    // pretend the acks were lost: enqueue the same batch again
    await s.outbox.enqueue(id, 'ride.points', [...s.server.rides.get(id)!.points.values()], s.now());
    await s.engine.drain();
    expect(s.server.rides.get(id)!.points.size).toBe(first);
  });

  test('a permanent failure parks that ride only; other rides keep syncing', async () => {
    const s = setup();
    await s.outbox.enqueue('bad-ride-0001', 'ride.upsert', { startedAt: 'x' }, s.now());
    await s.outbox.enqueue('bad-ride-0001', 'ride.finalize', {}, s.now());
    await s.outbox.enqueue('good-ride-001', 'ride.upsert', { startedAt: 'x' }, s.now());
    s.server.failOnce(new ApiError(400, 'invalid_input', 'bad'));
    const state = await s.engine.drain();
    expect(state.dead).toBe(1);
    expect(s.server.rides.has('good-ride-001')).toBe(true);
    expect(s.server.log).not.toContain('finalize:bad-ride-0001');
    await s.outbox.retryDead();
    await s.engine.drain();
    expect(s.server.rides.has('bad-ride-0001')).toBe(true);
  });

  test('transient failures back off and then recover', async () => {
    const s = setup();
    await s.outbox.enqueue('ride-00000001', 'ride.upsert', {}, s.now());
    s.server.failOnce(new ApiError(503, 'unavailable', 'down'));
    let state = await s.engine.drain();
    expect(state.pending).toBe(1);
    state = await s.engine.drain(); // still backing off: nothing happens
    expect(s.server.rides.size).toBe(0);
    s.tick(backoffMs(1) + 1);
    state = await s.engine.drain();
    expect(state.pending).toBe(0);
  });

  test('an auth failure stops everything until the user signs in again', async () => {
    const s = setup();
    await s.outbox.enqueue('ride-00000001', 'ride.upsert', {}, s.now());
    s.server.failOnce(new ApiError(401, 'unauthenticated', 'x', { retryable: false, authRequired: true }));
    const state = await s.engine.drain();
    expect(state.authRequired).toBe(true);
    expect(state.pending).toBe(1);
    expect(s.server.rides.size).toBe(0);
    s.engine.resumeAfterAuth();
    await s.engine.drain();
    expect(s.server.rides.size).toBe(1);
  });

  test('queued points for a ride deleted on the server are dropped, not retried forever', async () => {
    const s = setup();
    await s.outbox.enqueue('ride-00000001', 'ride.upsert', {}, s.now());
    await s.engine.drain();
    await s.outbox.enqueue('ride-00000001', 'ride.delete', {}, s.now());
    await s.outbox.enqueue('ride-00000001', 'ride.points', [{ seq: 0 }], s.now());
    const state = await s.engine.drain();
    expect(state.pending).toBe(0);
    expect(state.dead).toBe(0);
  });

  test('group rides are created through the group endpoint', async () => {
    const s = setup();
    await s.recorder.start({ groupRideId: 'group-ride-0001' });
    await s.engine.drain();
    expect(s.server.log.some((l) => l.startsWith('group-upsert:'))).toBe(true);
  });
});

describe('api client', () => {
  const resp = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  test('unwraps the envelope and refreshes an expired token exactly once', async () => {
    const calls: string[] = [];
    const client = createV2Client({
      baseUrl: 'http://x/api/v2',
      getToken: async () => 'old',
      refreshToken: async () => 'new',
      fetchImpl: (async (_url: any, init: any) => {
        calls.push(init.headers.Authorization);
        return calls.length === 1 ? resp(401, { ok: false, error: { code: 'unauthenticated', message: 'x' } }) : resp(200, { ok: true, data: { rides: 1 } });
      }) as any,
    });
    expect(await client.summary()).toEqual({ rides: 1 });
    expect(calls).toEqual(['Bearer old', 'Bearer new']);
  });

  test('a rejected refreshed token requires sign-in', async () => {
    const client = createV2Client({ baseUrl: 'http://x', getToken: async () => 'a', refreshToken: async () => 'b', fetchImpl: (async () => resp(401, { ok: false })) as any });
    await expect(client.summary()).rejects.toMatchObject({ authRequired: true });
  });

  test('classifies failures', async () => {
    const mk = (r: () => Promise<Response>) => createV2Client({ baseUrl: 'http://x', getToken: async () => 't', refreshToken: async () => 't', fetchImpl: r as any });
    await expect(mk(async () => { throw new Error('fail'); }).summary()).rejects.toMatchObject({ status: 0, retryable: true });
    await expect(mk(async () => resp(503, { ok: false, error: { code: 'x', message: 'y' } })).summary()).rejects.toMatchObject({ retryable: true });
    await expect(mk(async () => resp(400, { ok: false, error: { code: 'invalid_input', message: 'y' } })).summary()).rejects.toMatchObject({ retryable: false, code: 'invalid_input' });
    await expect(mk(async () => resp(502, null as any)).summary()).rejects.toMatchObject({ retryable: true });
  });

  test('config needs no token', async () => {
    let auth: string | undefined = 'unset';
    const client = createV2Client({ baseUrl: 'http://x', getToken: async () => { throw new Error('should not be called'); }, refreshToken: async () => null, fetchImpl: (async (_u: any, init: any) => { auth = init.headers.Authorization; return resp(200, { ok: true, data: { minAppVersion: '1.2.0', serverTime: 'x' } }); }) as any });
    expect((await client.config()).minAppVersion).toBe('1.2.0');
    expect(auth).toBeUndefined();
  });
});

describe('ride photos', () => {
  test('a photo taken offline is queued with the rider position and uploaded before the ride is finalized', async () => {
    const s = setup();
    const uploaded: any[] = [];
    (s.server.client as any).uploadPhoto = async (rideId: string, photoId: string, p: any) => { uploaded.push({ rideId, photoId, ...p }); };
    s.server.setOnline(false);
    const t0 = s.now();
    const id = await s.recorder.start();
    for (let i = 1; i <= 5; i++) { s.tick(1000); await s.recorder.addFix(fixAt(t0, i)); }
    expect(await s.recorder.addPhoto('photo-uuid-0001', 'file:///docs/ride-photos/photo-uuid-0001.jpg')).toBe(true);
    await s.recorder.end();
    await s.engine.drain();
    expect(uploaded).toHaveLength(0);

    s.server.setOnline(true);
    s.tick(10 * 60 * 1000);
    await s.engine.drain();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatchObject({ rideId: id, photoId: 'photo-uuid-0001', uri: 'file:///docs/ride-photos/photo-uuid-0001.jpg' });
    expect(uploaded[0].latitude).toBeCloseTo(6.45, 5);
    const order = s.server.log.filter((l) => l.includes(id));
    expect(order[order.length - 1]).toBe(`finalize:${id}`);
  });

  test('no photo can be added when there is no ride or it has ended', async () => {
    const s = setup();
    expect(await s.recorder.addPhoto('photo-uuid-0002', 'file:///x.jpg')).toBe(false);
    await s.recorder.start();
    await s.recorder.end();
    expect(await s.recorder.addPhoto('photo-uuid-0003', 'file:///x.jpg')).toBe(false);
  });

  test('a photo for a ride deleted on the server is dropped, not retried forever', async () => {
    const s = setup();
    (s.server.client as any).uploadPhoto = async () => { throw new ApiError(409, 'conflict', 'Ride was deleted'); };
    await s.outbox.enqueue('ride-00000001', 'ride.photo', { photoId: 'photo-uuid-0004', uri: 'file:///x.jpg' }, s.now());
    const state = await s.engine.drain();
    expect(state.pending).toBe(0);
    expect(state.dead).toBe(0);
  });
});
