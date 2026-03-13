// app/hooks/useSmartTracking.ts
// Advanced tracking hook: Device speed as primary, Roads API for path/distance correction,
// Haversine distance as real-time accumulator and offline fallback.

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { StatsCalculator } from '../utils/StatsCalculator';

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ROADS_API_BASE_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const BUFFER_SIZE = 8; // Flush every 8 points (more frequent than 10 for faster updates)
const FLUSH_INTERVAL_MS = 10000; // Faster flush for path refinement

// Speed thresholds - much lower to avoid killing real movement
const STATIONARY_SPEED_THRESHOLD_MPS = 0.5; // 0.5 m/s = 1.8 km/h (walking pace cutoff)
const DWELL_SPEED_THRESHOLD_MPS = 1.0; // 1.0 m/s = 3.6 km/h
const DWELL_THRESHOLD_MS = 5000; // 5 seconds stationary = dwelling

// Speed calculation
const MAX_REASONABLE_SPEED_MPS = 55.5; // 200 km/h
const MAX_ACCELERATION_MPS2 = 8.0; // Max realistic acceleration
const SPEED_SMOOTHING_FACTOR = 0.4; // Smooth speed display
const SPEED_DECAY_FACTOR = 0.4; // How fast speed drops to 0 when stopped

// Distance
const MIN_ACCURACY_FOR_TRACKING = 30; // Accept GPS readings up to 30m accuracy
const MAX_DISTANCE_BETWEEN_POINTS_KM = 0.5; // 500m max (filter GPS jumps)
const MIN_DISTANCE_FOR_ACCUMULATION_M = 3; // Minimum 3m between points to count as movement
const JITTER_ACCURACY_MULTIPLIER = 0.5; // distance must be > accuracy * mutliplier to count as movement
const MIN_MOVE_METERS_FOR_SPEED = 2; // meters needed between points to trust a new speed calc

// Max speed validation
const MAX_SPEED_SAMPLES_REQUIRED = 2; // Require 2 sustained samples for max speed

// Calculate distance between two points (Haversine formula)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
  const maxSpeedRef = useRef<number>(0); // Stable ref for use inside callbacks

  // Refs for mutable state
  const bufferRef = useRef<SmartLocation[]>([]);
  const lastFlushTimeRef = useRef<number>(Date.now());
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isMovingRef = useRef<boolean>(false);
  const lastMovementTimeRef = useRef<number>(0);

  // Live Haversine distance accumulation
  const haversineDistanceRef = useRef<number>(0); // km - accumulated from raw GPS
  const lastAccumulationPointRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  // Roads API corrected distance (replaces haversine when available)
  const roadsApiDistanceRef = useRef<number>(0); // km - from snapped points
  const roadsApiActiveRef = useRef<boolean>(false); // true once first successful Roads API call

  // Dwell detection
  const stationaryStartTimeRef = useRef<number | null>(null);
  const isDwellingRef = useRef<boolean>(false);

  // Speed tracking
  const previousSpeedRef = useRef<number>(0);
  const previousSpeedTimeRef = useRef<number>(0);
  const smoothedSpeedRef = useRef<number>(0);
  const highSpeedSamplesRef = useRef<number[]>([]);

  // Flush buffer to Google Roads API
  const flushBufferToRoadsAPI = useCallback(async () => {
    if (bufferRef.current.length < 2) return;

    const pointsToSnap = [...bufferRef.current];
    // Keep last point for continuity
    const lastPoint = pointsToSnap[pointsToSnap.length - 1];
    bufferRef.current = [lastPoint];
    lastFlushTimeRef.current = Date.now();

    if (!GOOGLE_MAPS_API_KEY) {
      // No API key - just use raw points for the path display
      setOfficialSnappedPath(prev => [
        ...prev,
        ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
      ]);
      // Distance stays as Haversine (already accumulated in real-time)
      return;
    }

    try {
      const path = pointsToSnap.map(p => `${p.latitude},${p.longitude}`).join('|');
      const url = `${ROADS_API_BASE_URL}?path=${path}&interpolate=true&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.snappedPoints && data.snappedPoints.length > 0) {
        const newSnappedPoints = data.snappedPoints.map((p: any) => ({
          latitude: p.location.latitude,
          longitude: p.location.longitude
        }));

        setOfficialSnappedPath(prev => [...prev, ...newSnappedPoints]);

        // Calculate snapped segment distance
        let segmentDist = 0;
        for (let i = 1; i < newSnappedPoints.length; i++) {
          segmentDist += haversineDistance(
            newSnappedPoints[i - 1].latitude, newSnappedPoints[i - 1].longitude,
            newSnappedPoints[i].latitude, newSnappedPoints[i].longitude
          );
        }
        roadsApiDistanceRef.current += segmentDist;
        roadsApiActiveRef.current = true;

        // Use Roads API distance as the official distance (more accurate than Haversine)
        setOfficialDistance(roadsApiDistanceRef.current);
      } else {
        // Roads API returned no points - fall back, append raw points for path
        setOfficialSnappedPath(prev => [
          ...prev,
          ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
        ]);
        // Keep using Haversine distance
        setOfficialDistance(haversineDistanceRef.current);
      }
    } catch (error) {
      // Roads API failed - append raw points for path display
      setOfficialSnappedPath(prev => [
        ...prev,
        ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
      ]);
      // Keep using Haversine distance
      setOfficialDistance(haversineDistanceRef.current);
    }
  }, []);

  // Handle new location update
  const handleLocationUpdate = useCallback((location: Location.LocationObject) => {
    const { latitude, longitude, speed: deviceSpeed, heading, accuracy } = location.coords;
    const timestamp = location.timestamp;
    const now = Date.now();

    // Filter out very low-accuracy GPS readings
    if (accuracy && accuracy > MIN_ACCURACY_FOR_TRACKING) {
      return;
    }

    // === SPEED CALCULATION ===
    // PRIMARY: Use device-reported speed (GPS chips calculate via Doppler shift - very accurate)
    // Device speed is in m/s, can be null or negative (invalid)
    let rawSpeedMps = 0;

    if (deviceSpeed !== null && deviceSpeed !== undefined && deviceSpeed >= 0) {
      rawSpeedMps = deviceSpeed;
    }

    // === GPS-BASED SPEED FALLBACK ===
    // If device speed is 0 or null, calculate from GPS distance/time
    if (rawSpeedMps <= 0.1 && lastAccumulationPointRef.current) {
      const distM = haversineDistance(
        lastAccumulationPointRef.current.latitude,
        lastAccumulationPointRef.current.longitude,
        latitude,
        longitude
      ) * 1000;

      const timeSec = (now - lastAccumulationPointRef.current.timestamp) / 1000;

      if (timeSec > 0.5 && distM >= MIN_MOVE_METERS_FOR_SPEED) {
        const calculatedSpeed = distM / timeSec;
        // Only trust if it's a reasonable walking/driving speed
        if (calculatedSpeed > 0.3 && calculatedSpeed < MAX_REASONABLE_SPEED_MPS) {
          rawSpeedMps = calculatedSpeed;
        }
      }
    }

    // Cap unreasonable speeds
    if (rawSpeedMps > MAX_REASONABLE_SPEED_MPS) {
      rawSpeedMps = 0;
    }

    // Acceleration-based filtering: reject unrealistic speed jumps
    if (previousSpeedTimeRef.current > 0 && rawSpeedMps > 0) {
      const timeSinceLastSpeed = (now - previousSpeedTimeRef.current) / 1000;
      if (timeSinceLastSpeed > 0.5) {
        const speedChange = Math.abs(rawSpeedMps - previousSpeedRef.current);
        const acceleration = speedChange / timeSinceLastSpeed;
        if (acceleration > MAX_ACCELERATION_MPS2 && rawSpeedMps > previousSpeedRef.current) {
          // Cap the increase (don't cap braking)
          const maxAllowedChange = MAX_ACCELERATION_MPS2 * timeSinceLastSpeed;
          rawSpeedMps = Math.min(rawSpeedMps, previousSpeedRef.current + maxAllowedChange);
        }
      }
    }
    previousSpeedRef.current = rawSpeedMps;
    previousSpeedTimeRef.current = now;

    // === DWELL DETECTION ===
    if (rawSpeedMps < DWELL_SPEED_THRESHOLD_MPS) {
      if (stationaryStartTimeRef.current === null) {
        stationaryStartTimeRef.current = now;
      } else {
        const stationaryDuration = now - stationaryStartTimeRef.current;
        if (stationaryDuration >= DWELL_THRESHOLD_MS && !isDwellingRef.current) {
          isDwellingRef.current = true;
        }
      }
    } else {
      if (stationaryStartTimeRef.current !== null) {
        stationaryStartTimeRef.current = null;
      }
      if (isDwellingRef.current) {
        isDwellingRef.current = false;
      }
    }

    // === SPEED FILTERING ===
    const filteredSpeed = rawSpeedMps < STATIONARY_SPEED_THRESHOLD_MPS ? 0 : rawSpeedMps;
    const preSmoothedSpeed = isDwellingRef.current ? 0 : filteredSpeed;

    // Smooth speed for display
    let displaySpeedMps: number;
    if (preSmoothedSpeed === 0) {
      displaySpeedMps = smoothedSpeedRef.current * SPEED_DECAY_FACTOR;
      if (displaySpeedMps < 0.3) displaySpeedMps = 0;
    } else {
      const factor = preSmoothedSpeed < smoothedSpeedRef.current ? 0.5 : SPEED_SMOOTHING_FACTOR;
      displaySpeedMps = smoothedSpeedRef.current + factor * (preSmoothedSpeed - smoothedSpeedRef.current);
    }
    smoothedSpeedRef.current = displaySpeedMps;

    // === EMIT LOCATION ===
    const smartLoc: SmartLocation = {
      latitude,
      longitude,
      speed: displaySpeedMps,
      heading: heading || 0,
      timestamp,
      accuracy: accuracy || 0
    };
    setLiveRawLocation(smartLoc);

    // === MAX SPEED ===
    if (filteredSpeed > 0) {
      const speedKmh = filteredSpeed * 3.6;
      const currentMax = maxSpeedRef.current;
      if (speedKmh > currentMax * 0.9 || speedKmh > 40) {
        highSpeedSamplesRef.current.push(speedKmh);
        if (highSpeedSamplesRef.current.length > 5) {
          highSpeedSamplesRef.current.shift();
        }
        const recentHighSamples = highSpeedSamplesRef.current.filter(s => s >= speedKmh * 0.85);
        if (recentHighSamples.length >= MAX_SPEED_SAMPLES_REQUIRED && speedKmh > currentMax) {
          const sorted = [...recentHighSamples].sort((a, b) => a - b);
          const medianSpeed = sorted[Math.floor(sorted.length / 2)];
          const newMax = Math.max(currentMax, medianSpeed);
          maxSpeedRef.current = newMax;
          setMaxSpeed(newMax);
        }
      } else if (speedKmh < currentMax * 0.5) {
        highSpeedSamplesRef.current = [];
      }
    }

    // === MOVING TIME ===
    if (filteredSpeed > 0 && !isDwellingRef.current) {
      if (!isMovingRef.current) {
        isMovingRef.current = true;
        lastMovementTimeRef.current = now;
      } else {
        const delta = (now - lastMovementTimeRef.current) / 1000;
        if (delta > 0 && delta < 30) { // Cap at 30s to avoid huge jumps
          setMovingTime(prev => prev + delta);
        }
        lastMovementTimeRef.current = now;
      }
    } else {
      isMovingRef.current = false;
    }

    // === DISTANCE ACCUMULATION (Haversine - real-time) ===
    // Accumulate distance from raw GPS positions regardless of Roads API
    if (lastAccumulationPointRef.current && filteredSpeed > 0) {
      const distKm = haversineDistance(
        lastAccumulationPointRef.current.latitude,
        lastAccumulationPointRef.current.longitude,
        latitude,
        longitude
      );
      const distMeters = distKm * 1000;

      // Jitter Filtering: Only count if moved enough relative to accuracy
      // This prevents "walking 20m and getting 0.1km" due to GPS noise
      const minMoveMeters = Math.max(MIN_DISTANCE_FOR_ACCUMULATION_M, (accuracy || 10) * JITTER_ACCURACY_MULTIPLIER);

      if (distMeters >= minMoveMeters && distKm <= MAX_DISTANCE_BETWEEN_POINTS_KM) {
        haversineDistanceRef.current += distKm;

        // If Roads API hasn't been active yet, use Haversine as official distance
        if (!roadsApiActiveRef.current) {
          setOfficialDistance(haversineDistanceRef.current);
        }
      }
    }

    // Update last accumulation point when moving OR when we don't have one yet
    if (filteredSpeed > 0 || !lastAccumulationPointRef.current) {
      lastAccumulationPointRef.current = { latitude, longitude, timestamp: now };
    }

    // === BUFFERING FOR ROADS API ===
    // Buffer ALL points with good accuracy for Roads API snapping
    // Don't require speed > 0 - the Roads API handles stationary filtering
    const accuracyOk = !accuracy || accuracy <= MIN_ACCURACY_FOR_TRACKING;
    if (accuracyOk) {
      // Only buffer if we've moved at least a tiny bit (prevents duplicate stationary points)
      const lastBuffered = bufferRef.current[bufferRef.current.length - 1];
      let shouldBuffer = true;
      if (lastBuffered) {
        const distFromLast = haversineDistance(lastBuffered.latitude, lastBuffered.longitude, latitude, longitude) * 1000;
        shouldBuffer = distFromLast >= 2; // At least 2m from last buffered point
      }

      if (shouldBuffer) {
        bufferRef.current.push(smartLoc);
      }
    }

    // === CHECK FLUSH CONDITIONS ===
    if (
      bufferRef.current.length >= BUFFER_SIZE ||
      (Date.now() - lastFlushTimeRef.current > FLUSH_INTERVAL_MS && bufferRef.current.length > 1)
    ) {
      flushBufferToRoadsAPI();
    }

  }, [flushBufferToRoadsAPI]);

  // Track previous isTracking state
  const prevIsTrackingRef = useRef<boolean>(false);

  // Start/Stop Tracking
  useEffect(() => {
    if (isTracking) {
      // Reset all state on new journey start
      if (!prevIsTrackingRef.current) {
        setOfficialDistance(0);
        setMovingTime(0);
        setMaxSpeed(0);
        maxSpeedRef.current = 0;
        setOfficialSnappedPath([]);
        setLiveRawLocation(null);
        isDwellingRef.current = false;

        bufferRef.current = [];
        lastFlushTimeRef.current = Date.now();
        isMovingRef.current = false;
        lastMovementTimeRef.current = 0;
        stationaryStartTimeRef.current = null;
        smoothedSpeedRef.current = 0;
        highSpeedSamplesRef.current = [];
        previousSpeedRef.current = 0;
        previousSpeedTimeRef.current = 0;

        // Reset distance tracking
        haversineDistanceRef.current = 0;
        roadsApiDistanceRef.current = 0;
        roadsApiActiveRef.current = false;
        lastAccumulationPointRef.current = null;
      }
      prevIsTrackingRef.current = true;

      const start = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }

        // Use Location.watchPositionAsync on ALL platforms for foreground tracking.
        // Previously Android used locationService.subscribe(), but that never fired
        // because JourneyContext manages journey state (isTracking) — not locationService.
        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000, // 1Hz for high-resolution tracking
            distanceInterval: 3, // 3 meters
          },
          handleLocationUpdate
        );
      };
      start();
    } else {
      prevIsTrackingRef.current = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      // Flush remaining buffer
      if (bufferRef.current.length > 1) {
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
    avgSpeed: StatsCalculator.calculateAverageSpeed(officialDistance, movingTime) / 3.6, // Return in m/s
    maxSpeed: maxSpeed / 3.6, // Return in m/s
  };
}
