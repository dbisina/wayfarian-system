// app/utils/journeyMap.ts
// Keep a tiny in-memory + AsyncStorage map of groupJourneyId -> groupId

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

export async function setJourneyGroupMap(groupJourneyId: string, groupId: string) {
  await load();
  mem![groupJourneyId] = String(groupId);
  await persist();
}

export async function removeJourneyGroupMap(groupJourneyId: string) {
  await load();
  if (mem && groupJourneyId in mem) {
    delete mem[groupJourneyId];
    await persist();
  }
}

export async function resolveGroupId(groupJourneyId?: string | null): Promise<string | null> {
  if (!groupJourneyId) return null;
  await load();
  const gid = mem ? mem[groupJourneyId] : undefined;
  return gid ? String(gid) : null;
}
