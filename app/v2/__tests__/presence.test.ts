import { describe, expect, test } from 'vitest';
import { createPresence, type PresenceSocket } from '../presence';

function fakeSocket(): PresenceSocket & { handlers: Record<string, Function[]>; sent: any[]; fire: (e: string, ...a: any[]) => void; disconnected: boolean } {
  const s: any = {
    connected: true,
    handlers: {},
    sent: [],
    disconnected: false,
    emit(event: string, payload: unknown, ack?: Function) { s.sent.push([event, payload]); ack?.({ ok: true }); },
    on(e: string, fn: Function) { (s.handlers[e] ??= []).push(fn); },
    off(e: string, fn: Function) { s.handlers[e] = (s.handlers[e] ?? []).filter((f: Function) => f !== fn); },
    disconnect() { s.disconnected = true; s.connected = false; },
    fire(e: string, ...a: any[]) { (s.handlers[e] ?? []).forEach((f: Function) => f(...a)); },
  };
  return s;
}

const pos = (userId: string, t: number, lat = 1) => ({ groupRideId: 'g1', userId, displayName: userId, lat, lng: 1, t });

describe('presence', () => {
  test('joins immediately when connected and again after every reconnect', () => {
    const s = fakeSocket();
    createPresence({ socket: s, groupRideId: 'g1', selfUserId: 'me' });
    expect(s.sent.filter(([e]) => e === 'gr:join')).toHaveLength(1);
    s.fire('connect');
    expect(s.sent.filter(([e]) => e === 'gr:join')).toHaveLength(2);
  });

  test('tracks others, ignores self, other rides and late updates', () => {
    const s = fakeSocket();
    let clock = 1000;
    const seen: number[] = [];
    const p = createPresence({ socket: s, groupRideId: 'g1', selfUserId: 'me', now: () => clock, onChange: (r) => seen.push(r.length) });
    s.fire('gr:pos', pos('a', 100, 5));
    s.fire('gr:pos', pos('a', 90, 9)); // older: ignored
    s.fire('gr:pos', pos('me', 100));
    s.fire('gr:pos', { ...pos('b', 100), groupRideId: 'other' });
    expect(p.riders().map((r) => [r.userId, r.lat])).toEqual([['a', 5]]);
  });

  test('snapshot fills the map, offline removes a rider, silent riders are pruned', () => {
    const s = fakeSocket();
    let clock = 1000;
    const p = createPresence({ socket: s, groupRideId: 'g1', selfUserId: 'me', now: () => clock, staleAfterMs: 5000 });
    s.fire('gr:snapshot', { groupRideId: 'g1', positions: [pos('a', 1), pos('b', 2)] });
    expect(p.riders()).toHaveLength(2);
    s.fire('gr:offline', { groupRideId: 'g1', userId: 'a' });
    expect(p.riders().map((r) => r.userId)).toEqual(['b']);
    clock += 6000;
    expect(p.riders()).toHaveLength(0);
    p.prune();
  });

  test('our position is rate limited and not sent while offline', () => {
    const s = fakeSocket();
    let clock = 1000;
    const p = createPresence({ socket: s, groupRideId: 'g1', selfUserId: 'me', now: () => clock });
    expect(p.sendPosition({ lat: 1, lng: 1 })).toBe(true);
    expect(p.sendPosition({ lat: 1, lng: 1 })).toBe(false);
    clock += 1001;
    expect(p.sendPosition({ lat: 1, lng: 1 })).toBe(true);
    s.connected = false;
    clock += 2000;
    expect(p.sendPosition({ lat: 1, lng: 1 })).toBe(false);
  });

  test('dispose leaves the room, stops listening and disconnects', () => {
    const s = fakeSocket();
    const p = createPresence({ socket: s, groupRideId: 'g1', selfUserId: 'me' });
    p.dispose();
    expect(s.sent.some(([e]) => e === 'gr:leave')).toBe(true);
    expect(s.disconnected).toBe(true);
    expect(s.handlers['gr:pos']).toEqual([]);
    expect(p.sendPosition({ lat: 1, lng: 1 })).toBe(false);
  });
});
