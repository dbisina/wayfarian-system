// app/components/ui/SpeedLimitSign.tsx
// Displays the current speed limit using Google Roads API.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SpeedLimitSignProps {
  latitude: number;
  longitude: number;
}

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ROADS_API_SPEED_LIMITS_URL = 'https://roads.googleapis.com/v1/speedLimits';

// Minimum distance (degrees ≈ 50m) between fetches
const MIN_FETCH_DELTA = 0.0005;
// Minimum time (ms) between fetches — never more than once per 30s
const MIN_FETCH_INTERVAL_MS = 30_000;

export const SpeedLimitSign: React.FC<SpeedLimitSignProps> = ({ latitude, longitude }) => {
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const lastFetchCoordsRef = React.useRef<{ lat: number; lon: number } | null>(null);
  const lastFetchTimeRef = React.useRef<number>(0);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;

    const now = Date.now();
    const timeSinceLast = now - lastFetchTimeRef.current;
    const prev = lastFetchCoordsRef.current;
    const latDelta = prev ? Math.abs(latitude - prev.lat) : Infinity;
    const lonDelta = prev ? Math.abs(longitude - prev.lon) : Infinity;

    // Skip if we fetched recently AND haven't moved enough.
    // This limits calls to at most once per 30s, and only when moved ~50m.
    if (timeSinceLast < MIN_FETCH_INTERVAL_MS && latDelta < MIN_FETCH_DELTA && lonDelta < MIN_FETCH_DELTA) {
      return;
    }

    lastFetchTimeRef.current = now;
    lastFetchCoordsRef.current = { lat: latitude, lon: longitude };

    const fetchSpeedLimit = async () => {
      try {
        const path = `${latitude},${longitude}`;
        const url = `${ROADS_API_SPEED_LIMITS_URL}?path=${path}&key=${GOOGLE_MAPS_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.speedLimits && data.speedLimits.length > 0) {
          const limit = data.speedLimits[0].speedLimit;
          setSpeedLimit(limit > 0 ? limit : null);
        } else {
          setSpeedLimit(null);
        }
      } catch (error) {
        console.warn('[SpeedLimitSign] Failed to fetch limit:', error);
      }
    };

    fetchSpeedLimit();

  }, [latitude, longitude]);

  if (!speedLimit) return null;

  return (
    <View style={styles.container}>
      <View style={styles.circle}>
        <Text style={styles.limitText}>{Math.round(speedLimit)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    top: 100, // Adjust based on layout
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 40,
    padding: 2,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#CC0000', // Standard red circle
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  limitText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'black',
  },
});
