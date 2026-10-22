// app/v2/runtime.ts
//
// The one place the v2 pieces are assembled for the real app: API client on the existing auth
// token, SQLite stores, the sync engine, the recorder, the session wipe and the query cache.
// It is created lazily and is safe to call from the background location task, which can wake
// the app in a headless JS context before any screen has mounted.

import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getAuth } from 'firebase/auth';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { API_URL, getAuthToken, setAuthToken } from '../services/api';
import { createV2Client } from './api';
import { createSyncEngine, type SyncState } from './outbox';
import { createRecorder, type LiveStats } from './recorder';
import { createSession } from './session';
import { SqliteLocalRideStore, SqliteOutboxStore, getOwner, setOwner, wipeAll } from './sqlite';

const QUERY_CACHE_KEY = 'wf-v2-query-cache';
const SYNC_INTERVAL_MS = 30_000;

async function refreshToken(): Promise<string | null> {
  const user = getAuth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken(true);
  if (token) await setAuthToken(token);
  return token || null;
}

function build() {
  const client = createV2Client({ baseUrl: `${API_URL.replace(/\/$/, '')}/v2`, getToken: getAuthToken, refreshToken });
  const outbox = new SqliteOutboxStore();
  const local = new SqliteLocalRideStore();

  const syncListeners = new Set<(s: SyncState) => void>();
  const engine = createSyncEngine({
    store: outbox,
    client,
    onChange: (s) => syncListeners.forEach((fn) => fn(s)),
  });

  const recorder = createRecorder({
    local,
    outbox,
    newId: () => Crypto.randomUUID(),
    kick: () => { void engine.drain(); },
  });

  const liveListeners = new Set<(s: LiveStats | null) => void>();
  const emitLive = (s: LiveStats | null) => liveListeners.forEach((fn) => fn(s));

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // fresh for 30 s, then refetched on focus/mount; never silently stale forever
        gcTime: 24 * 60 * 60 * 1000,
        retry: 2,
        networkMode: 'offlineFirst', // show cached data immediately, refetch when the network allows
        refetchOnReconnect: true,
      },
    },
  });
  const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: QUERY_CACHE_KEY, throttleTime: 1000 });

  const session = createSession({
    getOwner,
    setOwner,
    wipeLocal: async () => {
      await wipeAll();
      const { clearRidePhotos } = await import('./rideController');
      await clearRidePhotos();
    },
    clearQueryCache: async () => {
      queryClient.clear();
      await persister.removeClient();
    },
    stopLive: async () => {
      emitLive(null);
      const { stopTracking } = await import('./locationEngine');
      await stopTracking().catch(() => {});
    },
    hasUnsyncedWork: async () => {
      const { pending } = await outbox.counts();
      return pending > 0;
    },
  });

  return { client, outbox, local, engine, recorder, queryClient, persister, session, syncListeners, liveListeners, emitLive };
}

type Runtime = ReturnType<typeof build>;
let runtime: Runtime | null = null;
let restoring: Promise<unknown> | null = null;

export function getRuntime(): Runtime {
  if (!runtime) runtime = build();
  return runtime;
}

/**
 * Make sure an interrupted ride is loaded into the recorder. The background task calls this on
 * every wake-up, because the OS may have restarted the app with no UI.
 */
export async function ensureRestored(): Promise<void> {
  const rt = getRuntime();
  if (rt.recorder.currentRideId()) return;
  if (!restoring) restoring = rt.recorder.restore().finally(() => { restoring = null; });
  await restoring;
}

/** Uploads on reconnect, on returning to the foreground, and on a timer. Returns a stop function. */
export function startSyncTriggers(): () => void {
  const rt = getRuntime();
  const drain = () => { void rt.engine.drain(); };
  const net = NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) drain(); });
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') drain(); });
  const timer = setInterval(drain, SYNC_INTERVAL_MS);
  drain();
  return () => { net(); app.remove(); clearInterval(timer); };
}
