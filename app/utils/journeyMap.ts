/**
 * Bidirectional lookup between groupJourneyId and groupId.
 *
 * The map is kept both in memory (for zero-latency reads within a session) and
 * in AsyncStorage (so it survives app restarts). A single shared `loading`
 * promise prevents duplicate reads on concurrent first-access calls.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'gjid_to_gid_map';
let mem: Record<string, string> | null = null;
let loading: Promise<void> | null = null;

async function load() {
  if (mem) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      mem = raw ? JSON.parse(raw) : {};
    } catch {
      mem = {};
    }
  })();
  await loading; loading = null;
}

async function persist() {
  if (!mem) return;
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mem)); } catch {}
}

/**
 * Persists a groupJourneyId → groupId association.
 * @param groupJourneyId - The group journey document ID.
 * @param groupId - The parent group ID.
 */
export async function setJourneyGroupMap(groupJourneyId: string, groupId: string) {
  await load();
  mem![groupJourneyId] = String(groupId);
  await persist();
}

/**
 * Removes a groupJourneyId entry from the map.
 * No-op if the entry does not exist.
 * @param groupJourneyId - The group journey document ID to remove.
 */
export async function removeJourneyGroupMap(groupJourneyId: string) {
  await load();
  if (mem && groupJourneyId in mem) {
    delete mem[groupJourneyId];
    await persist();
  }
}

/**
 * Looks up the groupId for a given groupJourneyId.
 * @param groupJourneyId - The group journey document ID to resolve.
 * @returns The associated groupId, or null if not found or input is falsy.
 */
export async function resolveGroupId(groupJourneyId?: string | null): Promise<string | null> {
  if (!groupJourneyId) return null;
  await load();
  const gid = mem ? mem[groupJourneyId] : undefined;
  return gid ? String(gid) : null;
}
