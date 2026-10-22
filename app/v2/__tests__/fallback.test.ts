import { describe, expect, test, vi } from 'vitest';
import { ApiError, createV2Client } from '../api';
import { classifyProbe, createProbe } from '../serverProbe';
import { MemoryOutboxStore, createSyncEngine } from '../outbox';

const resp = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const client = (fetchImpl: any) => createV2Client({ baseUrl: 'http://x', getToken: async () => 't', refreshToken: async () => 't', fetchImpl });

describe('a server without the v2 API', () => {
  test('an Express-style 404 is temporary, but a v2 "not found" is real', async () => {
    const old = client(async () => resp(404, { error: 'Not Found', message: 'The requested resource GET /api/v2/x was not found' }));
    await expect(old.summary()).rejects.toMatchObject({ status: 404, code: 'server_unavailable', retryable: true });

    const v2 = client(async () => resp(404, { ok: false, error: { code: 'not_found', message: 'Ride not found' } }));
    await expect(v2.summary()).rejects.toMatchObject({ code: 'not_found', retryable: false });

    const proxy = client(async () => resp(404, null as any));
    await expect(proxy.summary()).rejects.toMatchObject({ retryable: true });
  });

  test('queued ride uploads wait for the server instead of being parked as failed', async () => {
    let clock = 1_000_000;
    const store = new MemoryOutboxStore();
    const c = client(async () => resp(404, { error: 'Not Found' }));
    const engine = createSyncEngine({ store, client: c as any, now: () => clock });
    await store.enqueue('ride-00000001', 'ride.upsert', { startedAt: new Date().toISOString() }, clock);
    await store.enqueue('ride-00000001', 'ride.finalize', {}, clock);
    const state = await engine.drain();
    expect(state.dead).toBe(0);
    expect(state.pending).toBe(2);
  });

  test('items parked dead by an older build can be retried once v2 appears', async () => {
    const store = new MemoryOutboxStore();
    const id = await store.enqueue('ride-00000002', 'ride.upsert', {}, 0);
    await store.fail(id, { error: 'http_error: Not Found', nextAttemptAt: 0, dead: true });
    expect((await store.counts()).dead).toBe(1);
    await store.retryDead();
    expect(await store.counts()).toEqual({ pending: 1, dead: 0 });
  });
});

describe('server probe', () => {
  test('classifies attempts', () => {
    expect(classifyProbe('unknown', { ok: true })).toBe('available');
    expect(classifyProbe('available', { ok: false, status: 404 })).toBe('missing');
    expect(classifyProbe('unknown', { ok: false, status: 405 })).toBe('missing');
    expect(classifyProbe('available', { ok: false })).toBe('available'); // offline says nothing
    expect(classifyProbe('missing', { ok: false, status: 503 })).toBe('missing');
    expect(classifyProbe('unknown', { ok: false })).toBe('unknown');
  });

  test('fires onAvailable when the server gains v2, not on every success', () => {
    const onAvailable = vi.fn();
    const seen: string[] = [];
    const probe = createProbe({ onAvailable });
    probe.subscribe((s) => seen.push(s));
    probe.record({ ok: false, status: 404 });
    probe.record({ ok: false, status: 404 });
    expect(onAvailable).not.toHaveBeenCalled();
    probe.record({ ok: true });
    probe.record({ ok: true });
    expect(onAvailable).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['missing', 'available']);
    probe.record({ ok: false, status: 404 }); // rolled back
    probe.record({ ok: true });
    expect(onAvailable).toHaveBeenCalledTimes(2);
  });
});
