// app/hooks/useSmartTracking.ts
// Advanced tracking hook implementing "Truth vs. Smooth" architecture.
// Manages GPS subscription, local buffering, and Google Roads API integration.

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { StatsCalculator } from '../utils/StatsCalculator';

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ROADS_API_BASE_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const BUFFER_SIZE = 10; // Flush every 10 points
const FLUSH_INTERVAL_MS = 30000; // Or every 30 seconds
const STATIONARY_SPEED_THRESHOLD = 1.5; // m/s (approx 5.4 km/h)

export interface SmartLocation {
  latitude: number;
  longitude: number;
  speed: number; // m/s
  heading: number;
  timestamp: number;
  accuracy: number;
}

export interface SnappedPoint {
  location: {
    latitude: number;
    longitude: number;
  };
  originalIndex: number;
  placeId: string;
}

export function useSmartTracking(isTracking: boolean) {
  const [liveRawLocation, setLiveRawLocation] = useState<SmartLocation | null>(null);
  const [officialSnappedPath, setOfficialSnappedPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [officialDistance, setOfficialDistance] = useState<number>(0); // in km
  const [movingTime, setMovingTime] = useState<number>(0); // in seconds
  const [maxSpeed, setMaxSpeed] = useState<number>(0); // km/h
  
  // Refs for mutable state without re-renders
  const bufferRef = useRef<SmartLocation[]>([]);
  const lastFlushTimeRef = useRef<number>(Date.now());
  const lastLocationRef = useRef<SmartLocation | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isMovingRef = useRef<boolean>(false);
  const lastMovementTimeRef = useRef<number>(0);

  // Helper to calculate distance between two points (Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Flush buffer to Google Roads API
  const flushBufferToRoadsAPI = useCallback(async () => {
    if (bufferRef.current.length < 2) return; // Need at least 2 points to snap a path effectively

    const pointsToSnap = [...bufferRef.current];
    // Keep the last point in the buffer to maintain continuity for the next segment
    const lastPoint = pointsToSnap[pointsToSnap.length - 1];
    bufferRef.current = [lastPoint]; 
    lastFlushTimeRef.current = Date.now();

    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('[SmartTracking] No Google Maps API Key provided. Skipping snapToRoads.');
      // Fallback: just append raw points
      setOfficialSnappedPath(prev => [
        ...prev, 
        ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
      ]);
      
      // Calculate distance roughly
      let addedDist = 0;
      for (let i = 1; i < pointsToSnap.length; i++) {
        addedDist += calculateDistance(
          pointsToSnap[i-1].latitude, pointsToSnap[i-1].longitude,
          pointsToSnap[i].latitude, pointsToSnap[i].longitude
        );
      }
      setOfficialDistance(prev => prev + addedDist);
      return;
    }

    try {
      const path = pointsToSnap.map(p => `${p.latitude},${p.longitude}`).join('|');
      const url = `${ROADS_API_BASE_URL}?path=${path}&interpolate=true&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.snappedPoints) {
        const newSnappedPoints = data.snappedPoints.map((p: any) => ({
          latitude: p.location.latitude,
          longitude: p.location.longitude
        }));

        setOfficialSnappedPath(prev => [...prev, ...newSnappedPoints]);

        // Calculate distance from snapped points
        let segmentDist = 0;
        for (let i = 1; i < newSnappedPoints.length; i++) {
          segmentDist += calculateDistance(
            newSnappedPoints[i-1].latitude, newSnappedPoints[i-1].longitude,
            newSnappedPoints[i].latitude, newSnappedPoints[i].longitude
          );
        }
        setOfficialDistance(prev => prev + segmentDist);
      } else {
        console.warn('[SmartTracking] Roads API returned no points', data);
      }
    } catch (error) {
      console.error('[SmartTracking] Error calling Roads API:', error);
    }
  }, []);

  // Handle new location update
  const handleLocationUpdate = useCallback((location: Location.LocationObject) => {
    const { latitude, longitude, speed, heading, accuracy } = location.coords;
    const timestamp = location.timestamp;

    // 1. Drift Filter (Local Physics)
    // If speed is below threshold, force it to 0 to prevent "ghost movement"
    const filteredSpeed = (speed || 0) < STATIONARY_SPEED_THRESHOLD ? 0 : (speed || 0);
    
    const smartLoc: SmartLocation = {
      latitude,
      longitude,
      speed: filteredSpeed,
      heading: heading || 0,
      timestamp,
      accuracy: accuracy || 0
    };

    setLiveRawLocation(smartLoc);
    lastLocationRef.current = smartLoc;

    // Update Max Speed
    const speedKmh = filteredSpeed * 3.6;
    setMaxSpeed(prev => Math.max(prev, speedKmh));

    // 2. Moving Time Calculation
    const now = Date.now();
    if (filteredSpeed > 0) {
      if (!isMovingRef.current) {
        isMovingRef.current = true;
        lastMovementTimeRef.current = now;
      } else {
        const delta = (now - lastMovementTimeRef.current) / 1000;
        setMovingTime(prev => prev + delta);
        lastMovementTimeRef.current = now;
      }
    } else {
      isMovingRef.current = false;
    }

    // 3. Buffering
    // Only buffer if we have moved or if it's a significant update
    // We can use the filtered speed to decide if we should add to buffer for the path
    if (filteredSpeed > 0) {
      bufferRef.current.push(smartLoc);
    }

    // 4. Check Flush Conditions
    if (
      bufferRef.current.length >= BUFFER_SIZE ||
      (Date.now() - lastFlushTimeRef.current > FLUSH_INTERVAL_MS && bufferRef.current.length > 0)
    ) {
      flushBufferToRoadsAPI();
    }

  }, [flushBufferToRoadsAPI]);

  // Start/Stop Tracking
  useEffect(() => {
    if (isTracking) {
      const start = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.error('Permission to access location was denied');
          return;
        }

        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000, // 2 seconds
            distanceInterval: 5, // 5 meters
          },
          handleLocationUpdate
        );
      };
      start();
    } else {
      // Stop tracking
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      // Flush remaining buffer
      if (bufferRef.current.length > 0) {
        flushBufferToRoadsAPI();
      }
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
    };
  }, [isTracking, handleLocationUpdate, flushBufferToRoadsAPI]);

  return {
    liveRawLocation,
    officialSnappedPath,
    officialDistance,
    movingTime,
    avgSpeed: StatsCalculator.calculateAverageSpeed(officialDistance, movingTime),
    maxSpeed,
  };
}
