import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Storage, { isMMKVAvailable, migrateFromAsyncStorage } from '../services/storage';
// notificationService is imported dynamically below to avoid crash on startup

const STORE_KEYS = {
  notifications: 'settings.notificationsEnabled',
  units: 'settings.units',
  mapType: 'settings.mapType',
  vehicle: 'settings.vehicle',
} as const;

export type Units = 'km' | 'mi';
export type MapType = 'standard' | 'satellite' | 'terrain';
export type Vehicle = 'car' | 'bike' | 'scooter';

/** Shape of the settings context value exposed to consumers. */
interface SettingsContextType {
  notificationsEnabled: boolean;
  units: Units;
  mapType: MapType;
  vehicle: Vehicle;
  setNotificationsEnabled: (val: boolean) => Promise<void>;
  setUnits: (val: Units) => Promise<void>;
  setMapType: (val: MapType) => Promise<void>;
  setVehicle: (val: Vehicle) => Promise<void>;
  /** Converts a raw km value to a locale-formatted string including the unit label. */
  convertDistance: (km: number) => string;
  /** Converts a raw km/h value to a locale-formatted string including the unit label. */
  convertSpeed: (kmh: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/** Loads user preferences from MMKV / AsyncStorage and provides setters that persist changes. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [units, setUnitsState] = useState<Units>('km');
  const [mapType, setMapTypeState] = useState<MapType>('standard');
  const [vehicle, setVehicleState] = useState<Vehicle>('car');

  useEffect(() => {
    (async () => {
      try {
        // One-time migration from AsyncStorage to MMKV when the faster store becomes available.
        if (isMMKVAvailable()) {
          await migrateFromAsyncStorage(Object.values(STORE_KEYS));
        }

        const [n, u, m, v] = await Promise.all([
          Storage.get(STORE_KEYS.notifications),
          Storage.get(STORE_KEYS.units),
          Storage.get(STORE_KEYS.mapType),
          Storage.get(STORE_KEYS.vehicle),
        ]);

        // null means the key was never written; default to notifications enabled.
        const shouldEnableNotifications = n === null || n === '1';
        if (n !== null) setNotificationsEnabledState(n === '1');
        if (u === 'km' || u === 'mi') setUnitsState(u);
        if (m === 'standard' || m === 'satellite' || m === 'terrain') setMapTypeState(m as MapType);
        if (v === 'car' || v === 'bike' || v === 'scooter') setVehicleState(v as Vehicle);

        // Register push tokens on cold start so they're fresh without waiting for the user to
        // toggle the setting. Dynamic import avoids a crash when the native module isn't ready.
        if (shouldEnableNotifications) {
          try {
            const notificationService = await import('../services/notificationService');
            await notificationService.registerForPushNotifications();
            console.log('[Settings] Push notifications registered on app start');
          } catch (notifError) {
            console.warn('[Settings] Failed to register push notifications on start:', notifError);
          }
        }
      } catch (e) {
        console.warn('Failed to load settings', e);
      }
    })();
  }, []);

  /**
   * Toggle push notifications and sync the backend token registration state.
   * Dynamic import of notificationService prevents a startup crash on some devices.
   */
  const setNotificationsEnabled = async (val: boolean) => {
    setNotificationsEnabledState(val);
    try {
      await Storage.set(STORE_KEYS.notifications, val ? '1' : '0');

      const notificationService = await import('../services/notificationService');

      if (val) {
        await notificationService.registerForPushNotifications();
      } else {
        await notificationService.unregisterPushToken();
      }
    } catch (e) {
      console.warn('Failed to save notifications setting', e);
    }
  };

  /** Persist the chosen distance/speed unit. */
  const setUnits = async (val: Units) => {
    setUnitsState(val);
    try { await Storage.set(STORE_KEYS.units, val); } catch (e) { console.warn('Failed to save units setting', e); }
  };

  /** Persist the chosen map tile layer. */
  const setMapType = async (val: MapType) => {
    setMapTypeState(val);
    try { await Storage.set(STORE_KEYS.mapType, val); } catch (e) { console.warn('Failed to save mapType setting', e); }
  };

  /** Persist the user's default vehicle type. */
  const setVehicle = async (val: Vehicle) => {
    setVehicleState(val);
    try { await Storage.set(STORE_KEYS.vehicle, val); } catch (e) { console.warn('Failed to save vehicle setting', e); }
  };

  /**
   * Converts a distance in kilometres to a display string in the user's preferred unit.
   * @param km - Distance in kilometres.
   * @returns Formatted string, e.g. `"12.3 km"` or `"7.6 mi"`.
   */
  const convertDistance = (km: number): string => {
    if (units === 'mi') {
      return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
  };

  /**
   * Converts a speed in km/h to a display string in the user's preferred unit.
   * @param kmh - Speed in kilometres per hour.
   * @returns Formatted string, e.g. `"50 km/h"` or `"31 mph"`.
   */
  const convertSpeed = (kmh: number): string => {
    if (units === 'mi') {
      return `${(kmh * 0.621371).toFixed(0)} mph`;
    }
    return `${kmh.toFixed(0)} km/h`;
  };

  return (
    <SettingsContext.Provider value={{
      notificationsEnabled,
      units,
      mapType,
      vehicle,
      setNotificationsEnabled,
      setUnits,
      setMapType,
      setVehicle,
      convertDistance,
      convertSpeed,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Returns the settings context.
 * Must be called inside a `SettingsProvider`.
 */
export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
