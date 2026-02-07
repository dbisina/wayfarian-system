// app/services/storage.ts
// Fast storage abstraction - uses MMKV when available, falls back to AsyncStorage
// MMKV is synchronous and 100x faster than AsyncStorage for settings

import AsyncStorage from '@react-native-async-storage/async-storage';

// Try to import MMKV - it might not be installed
let MMKV: any = null;
let mmkvInstance: any = null;

try {
  // Dynamic import to avoid crash if not installed
  const mmkvModule = require('react-native-mmkv');
  MMKV = mmkvModule.MMKV;
  mmkvInstance = new MMKV();
  console.log('[Storage] MMKV initialized - using fast storage');
} catch (e) {
  console.log('[Storage] MMKV not available - using AsyncStorage fallback');
}

// Check if MMKV is available
export const isMMKVAvailable = (): boolean => mmkvInstance !== null;

// Synchronous get (only works with MMKV)
export const getSync = (key: string): string | null => {
  if (mmkvInstance) {
    return mmkvInstance.getString(key) ?? null;
  }
  console.warn('[Storage] getSync called but MMKV not available - use get() instead');
  return null;
};

// Synchronous set (only works with MMKV)
export const setSync = (key: string, value: string): void => {
  if (mmkvInstance) {
    mmkvInstance.set(key, value);
    return;
  }
  console.warn('[Storage] setSync called but MMKV not available - use set() instead');
};

// Async get (works with both MMKV and AsyncStorage)
export const get = async (key: string): Promise<string | null> => {
  if (mmkvInstance) {
    return mmkvInstance.getString(key) ?? null;
  }
  return AsyncStorage.getItem(key);
};

// Async set (works with both MMKV and AsyncStorage)
export const set = async (key: string, value: string): Promise<void> => {
  if (mmkvInstance) {
    mmkvInstance.set(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
};

// Async remove (works with both MMKV and AsyncStorage)
export const remove = async (key: string): Promise<void> => {
  if (mmkvInstance) {
    mmkvInstance.delete(key);
    return;
  }
  await AsyncStorage.removeItem(key);
};

// Get boolean (with sync support for MMKV)
export const getBoolSync = (key: string, defaultValue: boolean = false): boolean => {
  if (mmkvInstance) {
    const value = mmkvInstance.getBoolean(key);
    return value !== undefined ? value : defaultValue;
  }
  return defaultValue;
};

// Set boolean (with sync support for MMKV)
export const setBoolSync = (key: string, value: boolean): void => {
  if (mmkvInstance) {
    mmkvInstance.set(key, value);
    return;
  }
  console.warn('[Storage] setBoolSync called but MMKV not available');
};

// Get number (with sync support for MMKV)
export const getNumberSync = (key: string, defaultValue: number = 0): number => {
  if (mmkvInstance) {
    const value = mmkvInstance.getNumber(key);
    return value !== undefined ? value : defaultValue;
  }
  return defaultValue;
};

// Set number (with sync support for MMKV)
export const setNumberSync = (key: string, value: number): void => {
  if (mmkvInstance) {
    mmkvInstance.set(key, value);
    return;
  }
  console.warn('[Storage] setNumberSync called but MMKV not available');
};

// Migration utility - migrate data from AsyncStorage to MMKV
export const migrateFromAsyncStorage = async (keys: string[]): Promise<void> => {
  if (!mmkvInstance) {
    console.log('[Storage] MMKV not available, skipping migration');
    return;
  }

  console.log('[Storage] Migrating settings from AsyncStorage to MMKV...');

  for (const key of keys) {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        mmkvInstance.set(key, value);
        // Optionally remove from AsyncStorage after migration
        // await AsyncStorage.removeItem(key);
        console.log(`[Storage] Migrated: ${key}`);
      }
    } catch (e) {
      console.warn(`[Storage] Failed to migrate ${key}:`, e);
    }
  }

  console.log('[Storage] Migration complete');
};

// Default export for convenience
export default {
  get,
  set,
  remove,
  getSync,
  setSync,
  getBoolSync,
  setBoolSync,
  getNumberSync,
  setNumberSync,
  isMMKVAvailable,
  migrateFromAsyncStorage,
};
