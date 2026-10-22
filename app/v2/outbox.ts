// app/v2/outbox.ts
//
// Offline write queue plus the engine that drains it. Everything the app wants the server to
// know about a ride is queued here first and uploaded when there is a connection. Every server
// call is idempotent (client ids, seq-deduped points, guarded finalize), so "at least once"
// delivery is safe and the engine can simply retry.
//
// Ordering: items for the same ride go in the order they were queued, and a failing item blocks
// the items behind it for that ride only. Other rides keep syncing.

import { ApiError, V2Client, WireEvent, WirePoint } from './api';

export type OutboxKind = 'ride.upsert' | 'ride.points' | 'ride.events' | 'ride.finalize' | 'ride.delete';

export interface OutboxItem {
  id: number;
  rideId: string;
  kind: OutboxKind;
  payload: any;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  status: 'pending' | 'dead';
  lastError?: string;
  createdAt: number;
}

/** Persistence for the queue. SQLite in the app, memory in tests. */
export interface OutboxStore {
  enqueue(rideId: string, kind: OutboxKind, payload: unknown, now: number): Promise<number>;
  /** The oldest pending item of every ride, if it is due, oldest first. A ride with a dead item is skipped. */
  due(now: number): Promise<OutboxItem[]>;
  complete(id: number): Promise<void>;
  fail(id: number, patch: { error: string; nextAttemptAt: number; dead: boolean }): Promise<void>;
  /** Pending item count and dead item count. */
  counts(): Promise<{ pending: number; dead: number }>;
  /** Earliest time any pending item becomes due, or null. */
  nextDueAt(): Promise<number | null>;
  retryDead(rideId?: string): Promise<void>;
  deadItems(): Promise<OutboxItem[]>;
  clear(): Promise<void>;
}

export class MemoryOutboxStore implements OutboxStore {
  private items: OutboxItem[] = [];
  private seq = 0;

  async enqueue(rideId: string, kind: OutboxKind, payload: unknown, now: number) {
    const item: OutboxItem = { id: ++this.seq, rideId, kind, payload, attempts: 0, nextAttemptAt: now, status: 'pending', createdAt: now };
    this.items.push(item);
    return item.id;
  }
  async due(now: number) {
    const seen = new Set<string>();
    const out: OutboxItem[] = [];
    for (const it of this.items) {
      if (seen.has(it.rideId)) continue;
      seen.add(it.rideId); // only the head of each ride's queue may run
      if (it.status === 'pending' && it.nextAttemptAt <= now) out.push(it);
    }
    return out;
  }
  async complete(id: number) { this.items = this.items.filter((i) => i.id !== id); }
  async fail(id: number, patch: { error: string; nextAttemptAt: number; dead: boolean }) {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    it.attempts++;
    it.lastError = patch.error;
    it.nextAttemptAt = patch.nextAttemptAt;
    if (patch.dead) it.status = 'dead';
  }
  async counts() {
    return { pending: this.items.filter((i) => i.status === 'pending').length, dead: this.items.filter((i) => i.status === 'dead').length };
  }
  async nextDueAt() {
    const t = this.items.filter((i) => i.status === 'pending').map((i) => i.nextAttemptAt);
    return t.length ? Math.min(...t) : null;
  }
  async retryDead(rideId?: string) {
    for (const it of this.items) if (it.status === 'dead' && (!rideId || it.rideId === rideId)) { it.status = 'pending'; it.nextAttemptAt = 0; }
  }
  async deadItems() { return this.items.filter((i) => i.status === 'dead'); }
  async clear() { this.items = []; }
}

export interface SyncEngineDeps {
  store: OutboxStore;
  client: Pick<V2Client, 'upsertRide' | 'addPoints' | 'addEvents' | 'finalizeRide' | 'deleteRide' | 'startGroupMemberRide'>;
  now?: () => number;
  /** Called after every drain with the queue size, for the UI ("3 rides waiting to upload"). */
  onChange?: (state: SyncState) => void;
  maxBackoffMs?: number;
}

export interface SyncState { pending: number; dead: number; authRequired: boolean; lastError?: string; lastSyncAt?: number }

/** Server errors that mean "this was already dealt with", so the queued item is simply dropped. */
const isAlreadyHandled = (item: OutboxItem, err: ApiError) =>
  (err.code === 'conflict' && (item.kind === 'ride.points' || item.kind === 'ride.events' || item.kind === 'ride.finalize')) ||
  (err.status === 404 && item.kind === 'ride.delete');

export function backoffMs(attempts: number, max = 5 * 60 * 1000): number {
  return Math.min(max, 2000 * 2 ** Math.min(attempts, 10));
}

export function createSyncEngine(deps: SyncEngineDeps) {
  const now = deps.now ?? Date.now;
  let running: Promise<SyncState> | null = null;
  let authRequired = false;
  let lastError: string | undefined;
  let lastSyncAt: number | undefined;

  async function dispatch(item: OutboxItem) {
    const c = deps.client;
    switch (item.kind) {
      case 'ride.upsert': {
        const { groupRideId, ...input } = item.payload || {};
        return groupRideId ? c.startGroupMemberRide(groupRideId, item.rideId, input) : c.upsertRide(item.rideId, input);
      }
      case 'ride.points': return c.addPoints(item.rideId, item.payload as WirePoint[]);
      case 'ride.events': return c.addEvents(item.rideId, item.payload as WireEvent[]);
      case 'ride.finalize': return c.finalizeRide(item.rideId);
      case 'ride.delete': return c.deleteRide(item.rideId);
    }
  }

  async function state(): Promise<SyncState> {
    const { pending, dead } = await deps.store.counts();
    return { pending, dead, authRequired, lastError, lastSyncAt };
  }

  async function run(): Promise<SyncState> {
    if (authRequired) return state();
    // Keep going while anything is due: finishing one item exposes the next item of that ride.
    for (let guard = 0; guard < 10000; guard++) {
      const due = await deps.store.due(now());
      if (!due.length) break;
      let progressed = false;
      for (const item of due) {
        try {
          await dispatch(item);
          await deps.store.complete(item.id);
          lastSyncAt = now();
          lastError = undefined;
          progressed = true;
        } catch (err) {
          const e = err instanceof ApiError ? err : new ApiError(0, 'network', (err as Error)?.message || 'error', { retryable: true });
          if (e.authRequired) { authRequired = true; lastError = e.message; deps.onChange?.(await state()); return state(); }
          if (isAlreadyHandled(item, e)) { await deps.store.complete(item.id); progressed = true; continue; }
          lastError = e.message;
          await deps.store.fail(item.id, {
            error: `${e.code}: ${e.message}`,
            nextAttemptAt: now() + backoffMs(item.attempts + 1, deps.maxBackoffMs),
            dead: !e.retryable,
          });
        }
      }
      if (!progressed) break; // everything left is backing off
    }
    const s = await state();
    deps.onChange?.(s);
    return s;
  }

  return {
    /** Upload whatever is due. Concurrent calls share one run. */
    drain(): Promise<SyncState> {
      if (!running) running = run().finally(() => { running = null; });
      return running;
    },
    /** After the user signs in again. */
    resumeAfterAuth() { authRequired = false; },
    state,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
