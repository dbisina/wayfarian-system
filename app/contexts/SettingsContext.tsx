import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEYS = {
  notifications: 'settings.notificationsEnabled',
  units: 'settings.units',
  mapType: 'settings.mapType',
  vehicle: 'settings.vehicle',
} as const;

export type Units = 'km' | 'mi';
export type MapType = 'standard' | 'satellite' | 'terrain';
export type Vehicle = 'car' | 'bike' | 'scooter';

interface SettingsContextType {
  notificationsEnabled: boolean;
  units: Units;
  mapType: MapType;
  vehicle: Vehicle;
  setNotificationsEnabled: (val: boolean) => Promise<void>;
  setUnits: (val: Units) => Promise<void>;
  setMapType: (val: MapType) => Promise<void>;
  setVehicle: (val: Vehicle) => Promise<void>;
  convertDistance: (km: number) => string; // Returns formatted string with unit
  convertSpeed: (kmh: number) => string; // Returns formatted string with unit
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [units, setUnitsState] = useState<Units>('km');
  const [mapType, setMapTypeState] = useState<MapType>('standard');
  const [vehicle, setVehicleState] = useState<Vehicle>('car');

  useEffect(() => {
    (async () => {
      try {
        const [n, u, m, v] = await Promise.all([
          AsyncStorage.getItem(STORE_KEYS.notifications),
          AsyncStorage.getItem(STORE_KEYS.units),
          AsyncStorage.getItem(STORE_KEYS.mapType),
          AsyncStorage.getItem(STORE_KEYS.vehicle),
        ]);
        if (n !== null) setNotificationsEnabledState(n === '1');
        if (u === 'km' || u === 'mi') setUnitsState(u);
        if (m === 'standard' || m === 'satellite' || m === 'terrain') setMapTypeState(m as MapType);
        if (v === 'car' || v === 'bike' || v === 'scooter') setVehicleState(v as Vehicle);
      } catch (e) {
        console.warn('Failed to load settings', e);
      }
    })();
  }, []);

  const setNotificationsEnabled = async (val: boolean) => {
    setNotificationsEnabledState(val);
    try { await AsyncStorage.setItem(STORE_KEYS.notifications, val ? '1' : '0'); } catch {}
  };

  const setUnits = async (val: Units) => {
    setUnitsState(val);
    try { await AsyncStorage.setItem(STORE_KEYS.units, val); } catch {}
  };

  const setMapType = async (val: MapType) => {
    setMapTypeState(val);
    try { await AsyncStorage.setItem(STORE_KEYS.mapType, val); } catch {}
  };

  const setVehicle = async (val: Vehicle) => {
    setVehicleState(val);
    try { await AsyncStorage.setItem(STORE_KEYS.vehicle, val); } catch {}
  };

  const convertDistance = (km: number): string => {
    if (units === 'mi') {
      return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
  };

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

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
