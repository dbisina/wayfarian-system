// app/components/ui/SpeedLimitSign.tsx
// Displays the current speed limit using Google Roads API.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface SpeedLimitSignProps {
  latitude: number;
  longitude: number;
}

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ROADS_API_SPEED_LIMITS_URL = 'https://roads.googleapis.com/v1/speedLimits';

export const SpeedLimitSign: React.FC<SpeedLimitSignProps> = ({ latitude, longitude }) => {
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [units, setUnits] = useState<'KPH' | 'MPH'>('KPH'); // Default to KPH, API returns KPH usually

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;

    const fetchSpeedLimit = async () => {
      try {
        // The Roads API requires a path or placeId. 
        // For a single point, we can try to snap it first or just pass it as a path of one point (might not work well).
        // Better approach: Use the nearest road segment.
        // However, speedLimits endpoint takes 'path' or 'placeId'.
        // Let's try passing the point as a path.
        const path = `${latitude},${longitude}`;
        const url = `${ROADS_API_SPEED_LIMITS_URL}?path=${path}&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.speedLimits && data.speedLimits.length > 0) {
          const limit = data.speedLimits[0].speedLimit;
          if (limit > 0) {
            setSpeedLimit(limit);
          } else {
            setSpeedLimit(null);
          }
        } else {
          setSpeedLimit(null);
        }
      } catch (error) {
        console.warn('[SpeedLimitSign] Failed to fetch limit:', error);
      }
    };

    // Debounce or throttle this call? 
    // We shouldn't call it every second. Maybe every 10 seconds or on significant location change.
    // For this component, we'll assume the parent controls when to render/update it, 
    // or we can add a check to only fetch if location changed significantly.
    
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
