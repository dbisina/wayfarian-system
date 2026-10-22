// app/v2/sqlite.ts
//
// On-device persistence for v2: the outbox, rides recorded on this phone and their GPS points.
// One database file, owned by exactly one signed-in user. When a different user signs in, or
// the user signs out, everything here is wiped, so no account ever sees another's data.

import * as SQLite from 'expo-sqlite';
import type { OutboxItem, OutboxKind, OutboxStore } from './outbox';
import type { LocalPoint, LocalRide, LocalRideStore } from './recorder';

const DB_NAME = 'wayfarian-v2.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ride_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            payload TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            last_error TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS outbox_ride ON outbox(ride_id, id);
          CREATE TABLE IF NOT EXISTS local_rides (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            json TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS local_points (
            ride_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            segment INTEGER NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            t INTEGER NOT NULL,
            accuracy REAL,
            PRIMARY KEY (ride_id, seq)
          );
          CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          PRAGMA user_version = ${SCHEMA_VERSION};
        `);
      }
      return db;
    })();
  }
  return dbPromise;
}

const rowToItem = (r: any): OutboxItem => ({
  id: r.id,
  rideId: r.ride_id,
  kind: r.kind as OutboxKind,
  payload: JSON.parse(r.payload),
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  status: r.status,
  lastError: r.last_error ?? undefined,
  createdAt: r.created_at,
});

export class SqliteOutboxStore implements OutboxStore {
  async enqueue(rideId: string, kind: OutboxKind, payload: unknown, now: number) {
    const db = await openDb();
    const res = await db.runAsync(
      'INSERT INTO outbox (ride_id, kind, payload, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?)',
      rideId, kind, JSON.stringify(payload), now, now
    );
    return res.lastInsertRowId;
  }

  async due(now: number) {
    const db = await openDb();
    // Only the oldest item of each ride may run, so a ride's uploads stay in order.
    const rows = await db.getAllAsync(
      `SELECT * FROM outbox o
       WHERE o.id = (SELECT MIN(id) FROM outbox WHERE ride_id = o.ride_id)
         AND o.status = 'pending' AND o.next_attempt_at <= ?
       ORDER BY o.id`,
      now
    );
    return rows.map(rowToItem);
  }

  async complete(id: number) {
    const db = await openDb();
    await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
  }

  async fail(id: number, patch: { error: string; nextAttemptAt: number; dead: boolean }) {
    const db = await openDb();
    await db.runAsync(
      'UPDATE outbox SET attempts = attempts + 1, last_error = ?, next_attempt_at = ?, status = ? WHERE id = ?',
      patch.error, patch.nextAttemptAt, patch.dead ? 'dead' : 'pending', id
    );
  }

  async counts() {
    const db = await openDb();
    const row = await db.getFirstAsync<{ pending: number; dead: number }>(
      "SELECT SUM(status = 'pending') AS pending, SUM(status = 'dead') AS dead FROM outbox"
    );
    return { pending: row?.pending ?? 0, dead: row?.dead ?? 0 };
  }

  async nextDueAt() {
    const db = await openDb();
    const row = await db.getFirstAsync<{ t: number | null }>("SELECT MIN(next_attempt_at) AS t FROM outbox WHERE status = 'pending'");
    return row?.t ?? null;
  }

  async retryDead(rideId?: string) {
    const db = await openDb();
    if (rideId) await db.runAsync("UPDATE outbox SET status = 'pending', next_attempt_at = 0 WHERE status = 'dead' AND ride_id = ?", rideId);
    else await db.runAsync("UPDATE outbox SET status = 'pending', next_attempt_at = 0 WHERE status = 'dead'");
  }

  async deadItems() {
    const db = await openDb();
    return (await db.getAllAsync("SELECT * FROM outbox WHERE status = 'dead' ORDER BY id")).map(rowToItem);
  }

  async clear() {
    const db = await openDb();
    await db.runAsync('DELETE FROM outbox');
  }
}

export class SqliteLocalRideStore implements LocalRideStore {
  async putRide(r: LocalRide) {
    const db = await openDb();
    await db.runAsync('INSERT OR REPLACE INTO local_rides (id, status, json) VALUES (?, ?, ?)', r.id, r.status, JSON.stringify(r));
  }
  async getRide(id: string) {
    const db = await openDb();
    const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM local_rides WHERE id = ?', id);
    return row ? (JSON.parse(row.json) as LocalRide) : null;
  }
  async activeRide() {
    const db = await openDb();
    const row = await db.getFirstAsync<{ json: string }>("SELECT json FROM local_rides WHERE status != 'ENDED' LIMIT 1");
    return row ? (JSON.parse(row.json) as LocalRide) : null;
  }
  async appendPoints(rideId: string, pts: LocalPoint[]) {
    const db = await openDb();
    await db.withTransactionAsync(async () => {
      for (const p of pts) {
        await db.runAsync(
          'INSERT OR IGNORE INTO local_points (ride_id, seq, segment, lat, lng, t, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)',
          rideId, p.seq, p.segment, p.lat, p.lng, p.t, p.accuracy
        );
      }
    });
  }
  async pointsOf(rideId: string) {
    const db = await openDb();
    return db.getAllAsync<LocalPoint>('SELECT seq, segment, lat, lng, t, accuracy FROM local_points WHERE ride_id = ? ORDER BY seq', rideId);
  }
  async listRides() {
    const db = await openDb();
    return (await db.getAllAsync<{ json: string }>('SELECT json FROM local_rides')).map((r) => JSON.parse(r.json) as LocalRide);
  }
  async deleteRide(id: string) {
    const db = await openDb();
    await db.runAsync('DELETE FROM local_points WHERE ride_id = ?', id);
    await db.runAsync('DELETE FROM local_rides WHERE id = ?', id);
  }
  async clear() {
    const db = await openDb();
    await db.runAsync('DELETE FROM local_points');
    await db.runAsync('DELETE FROM local_rides');
  }
}

export async function getOwner(): Promise<string | null> {
  const db = await openDb();
  return (await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = 'owner'"))?.value ?? null;
}

export async function setOwner(uid: string): Promise<void> {
  const db = await openDb();
  await db.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES ('owner', ?)", uid);
}

/** Remove every trace of the current user from this device's v2 database. */
export async function wipeAll(): Promise<void> {
  const db = await openDb();
  await db.execAsync('DELETE FROM outbox; DELETE FROM local_points; DELETE FROM local_rides; DELETE FROM kv;');
}
