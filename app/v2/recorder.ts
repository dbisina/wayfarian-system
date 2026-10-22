// app/v2/recorder.ts
//
// Records a ride on the device. The same ride-core code the server uses computes the live stats,
// every fix is saved locally first, and everything the server needs is queued in the outbox, so
// a ride works with no connection at all and survives the app being killed mid-ride.

import { StatsAccumulator, type RideStats } from '@wayfarian/ride-core';
import type { OutboxStore } from './outbox';
import type { WirePoint } from './api';

export type LocalRideStatus = 'RECORDING' | 'PAUSED' | 'ENDED';

export interface LocalRide {
  id: string;
  status: LocalRideStatus;
  startedAt: number;
  segment: number;
  nextSeq: number;
  /** Highest seq already handed to the outbox. */
  flushedSeq: number;
  vehicleId?: string;
  title?: string;
  timezone?: string;
  groupRideId?: string;
}

export interface LocalPoint { seq: number; segment: number; lat: number; lng: number; t: number; accuracy: number | null }

/** Durable on-device ride state. SQLite in the app, memory in tests. */
export interface LocalRideStore {
  putRide(r: LocalRide): Promise<void>;
  getRide(id: string): Promise<LocalRide | null>;
  /** The ride that is still being recorded or paused, if the app was killed mid-ride. */
  activeRide(): Promise<LocalRide | null>;
  appendPoints(rideId: string, pts: LocalPoint[]): Promise<void>;
  pointsOf(rideId: string): Promise<LocalPoint[]>;
  listRides(): Promise<LocalRide[]>;
  deleteRide(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryLocalRideStore implements LocalRideStore {
  rides = new Map<string, LocalRide>();
  points = new Map<string, LocalPoint[]>();
  async putRide(r: LocalRide) { this.rides.set(r.id, { ...r }); }
  async getRide(id: string) { const r = this.rides.get(id); return r ? { ...r } : null; }
  async activeRide() { return [...this.rides.values()].find((r) => r.status !== 'ENDED') ?? null; }
  async appendPoints(rideId: string, pts: LocalPoint[]) { this.points.set(rideId, [...(this.points.get(rideId) ?? []), ...pts]); }
  async pointsOf(rideId: string) { return [...(this.points.get(rideId) ?? [])]; }
  async listRides() { return [...this.rides.values()]; }
  async deleteRide(id: string) { this.rides.delete(id); this.points.delete(id); }
  async clear() { this.rides.clear(); this.points.clear(); }
}

export interface Fix { lat: number; lng: number; t: number; accuracy?: number | null; /** Speed the OS reported, m/s. Display and presence only, never used for stats. */ speedMps?: number | null }

export interface RecorderDeps {
  local: LocalRideStore;
  outbox: OutboxStore;
  newId: () => string;
  now?: () => number;
  /** Called after work is queued so the sync engine can try to upload. Must not throw. */
  kick?: () => void;
  flushEveryPoints?: number;
  flushEveryMs?: number;
}

export interface LiveStats extends RideStats {
  status: LocalRideStatus;
  rideId: string;
  /** Most recent accepted fix, for drawing the rider and sharing presence. */
  lastFix: { lat: number; lng: number; t: number; speedMps: number | null } | null;
}

const toWire = (p: LocalPoint): WirePoint => ({ seq: p.seq, segment: p.segment, lat: p.lat, lng: p.lng, t: new Date(p.t).toISOString(), accuracy: p.accuracy });
const MAX_BATCH = 500; // server accepts 1000; smaller batches fail less on poor connections

export function createRecorder(deps: RecorderDeps) {
  const now = deps.now ?? Date.now;
  const flushEveryPoints = deps.flushEveryPoints ?? 50;
  const flushEveryMs = deps.flushEveryMs ?? 15000;

  let ride: LocalRide | null = null;
  let acc = new StatsAccumulator();
  let buffer: LocalPoint[] = [];
  let lastFlushAt = 0;
  let lastFixT = -Infinity;
  let lastFix: { lat: number; lng: number; t: number; speedMps: number | null } | null = null;

  const kick = () => { try { deps.kick?.(); } catch { /* never let sync break recording */ } };

  const eventId = (type: string, t: number) => `${ride!.id}-${type.toLowerCase()}-${t.toString(36)}`;
  const queueEvent = (type: 'START' | 'PAUSE' | 'RESUME' | 'END', t: number) =>
    deps.outbox.enqueue(ride!.id, 'ride.events', [{ id: eventId(type, t), type, at: new Date(t).toISOString() }], now());

  async function flush() {
    if (!ride || buffer.length === 0) { lastFlushAt = now(); return; }
    const pending = buffer;
    buffer = [];
    for (let i = 0; i < pending.length; i += MAX_BATCH) {
      await deps.outbox.enqueue(ride.id, 'ride.points', pending.slice(i, i + MAX_BATCH).map(toWire), now());
    }
    ride.flushedSeq = pending[pending.length - 1].seq;
    await deps.local.putRide(ride);
    lastFlushAt = now();
    kick();
  }

  const snapshot = (): LiveStats => ({ ...acc.snapshot(), status: ride!.status, rideId: ride!.id, lastFix });

  return {
    /** Begin a new ride. Throws if one is already in progress. */
    async start(opts: { vehicleId?: string; title?: string; timezone?: string; groupRideId?: string } = {}): Promise<string> {
      if (ride && ride.status !== 'ENDED') throw new Error('A ride is already in progress');
      const startedAt = now();
      ride = { id: deps.newId(), status: 'RECORDING', startedAt, segment: 0, nextSeq: 0, flushedSeq: -1, ...opts };
      acc = new StatsAccumulator();
      acc.startSegment();
      buffer = [];
      lastFixT = -Infinity;
      lastFix = null;
      await deps.local.putRide(ride);
      await deps.outbox.enqueue(ride.id, 'ride.upsert', {
        startedAt: new Date(startedAt).toISOString(),
        vehicleId: opts.vehicleId,
        title: opts.title,
        timezone: opts.timezone,
        groupRideId: opts.groupRideId,
      }, now());
      await queueEvent('START', startedAt);
      lastFlushAt = now();
      kick();
      return ride.id;
    },

    /** Rebuild an interrupted ride (app killed or crashed) so recording can continue where it stopped. */
    async restore(): Promise<LiveStats | null> {
      const found = await deps.local.activeRide();
      if (!found) return null;
      ride = found;
      acc = new StatsAccumulator();
      const pts = await deps.local.pointsOf(found.id);
      let seg = -1;
      for (const p of pts) {
        if (p.segment !== seg) { acc.startSegment(); seg = p.segment; }
        acc.add(p);
        lastFixT = p.t;
        lastFix = { lat: p.lat, lng: p.lng, t: p.t, speedMps: null };
      }
      buffer = pts.filter((p) => p.seq > found.flushedSeq);
      lastFlushAt = now();
      // A restored recording starts a fresh segment: nothing is counted across the time the app was dead.
      if (ride.status === 'RECORDING') { ride.segment++; acc.startSegment(); await deps.local.putRide(ride); }
      return snapshot();
    },

    /** Feed one GPS fix. Returns fresh live stats, or null if no ride is recording. */
    async addFix(fix: Fix): Promise<LiveStats | null> {
      if (!ride || ride.status !== 'RECORDING') return null;
      if (!(fix.t > lastFixT)) return snapshot(); // duplicate or out-of-order delivery from the OS
      lastFixT = fix.t;
      lastFix = { lat: fix.lat, lng: fix.lng, t: fix.t, speedMps: fix.speedMps ?? null };
      const p: LocalPoint = { seq: ride.nextSeq++, segment: ride.segment, lat: fix.lat, lng: fix.lng, t: fix.t, accuracy: fix.accuracy ?? null };
      await deps.local.appendPoints(ride.id, [p]);
      acc.add(p);
      buffer.push(p);
      if (buffer.length >= flushEveryPoints || now() - lastFlushAt >= flushEveryMs) await flush();
      else await deps.local.putRide(ride);
      return snapshot();
    },

    async pause(): Promise<LiveStats | null> {
      if (!ride || ride.status !== 'RECORDING') return null;
      acc.endSegment();
      await flush();
      ride.status = 'PAUSED';
      await deps.local.putRide(ride);
      await queueEvent('PAUSE', now());
      kick();
      return snapshot();
    },

    async resume(): Promise<LiveStats | null> {
      if (!ride || ride.status !== 'PAUSED') return null;
      ride.segment++; // nothing is counted across the pause
      ride.status = 'RECORDING';
      acc.startSegment();
      lastFixT = -Infinity;
      await deps.local.putRide(ride);
      await queueEvent('RESUME', now());
      kick();
      return snapshot();
    },

    /** Stop recording. The ride is complete on the device straight away; the server finalizes when it hears about it. */
    async end(): Promise<LiveStats | null> {
      if (!ride || ride.status === 'ENDED') return null;
      acc.endSegment();
      await flush();
      const t = now();
      ride.status = 'ENDED';
      await deps.local.putRide(ride);
      await queueEvent('END', t);
      await deps.outbox.enqueue(ride.id, 'ride.finalize', {}, t);
      kick();
      return snapshot();
    },

    /** Discard a ride the server may already know about. Queued after its uploads so order is kept. */
    async discard(rideId: string): Promise<void> {
      await deps.outbox.enqueue(rideId, 'ride.delete', {}, now());
      await deps.local.deleteRide(rideId);
      if (ride?.id === rideId) { ride = null; buffer = []; }
      kick();
    },

    live(): LiveStats | null { return ride ? snapshot() : null; },
    currentRideId(): string | null { return ride?.id ?? null; },
  };
}

export type Recorder = ReturnType<typeof createRecorder>;
