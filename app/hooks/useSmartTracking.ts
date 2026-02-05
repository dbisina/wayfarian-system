// app/hooks/useSmartTracking.ts
// Advanced tracking hook implementing "Truth vs. Smooth" architecture.
// Manages GPS subscription, local buffering, and Google Roads API integration.

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { StatsCalculator } from '../utils/StatsCalculator';

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ROADS_API_BASE_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const BUFFER_SIZE = 10; // Flush every 10 points
const FLUSH_INTERVAL_MS = 30000; // Or every 30 seconds
const STATIONARY_SPEED_THRESHOLD = 1.5; // m/s (approx 5.4 km/h)
const MIN_TIME_DELTA_FOR_SPEED_CALC = 2.0; // INCREASED: Minimum 2 seconds for accurate speed calculation (was 1.0)
const MIN_DISTANCE_FOR_SPEED_CALC = 3.0; // NEW: Minimum 3 meters moved to calculate speed (prevents jitter spikes)
const MAX_REASONABLE_SPEED_MPS = 69.4; // 250 km/h in m/s - filter extreme GPS jitter
const MIN_ACCURACY_FOR_DISTANCE = 30; // Ignore GPS readings with accuracy worse than 30m
const POSITION_SMOOTHING_FACTOR = 0.3; // Exponential smoothing for position
const SPEED_SMOOTHING_FACTOR = 0.4; // Exponential smoothing for speed display (higher = more responsive)
const SPEED_CALC_WINDOW_MS = 5000; // 5 second window for speed calculation
const MAX_SPEED_SAMPLES_REQUIRED = 2; // Require 2 samples at high speed before updating max
const LOW_SPEED_THRESHOLD_MPS = 3.0; // Speed below which we apply extra filtering (10.8 km/h)
const LOW_SPEED_EXTRA_SMOOTHING = 0.2; // More aggressive smoothing at low speeds

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  // Refs for mutable state without re-renders
  const bufferRef = useRef<SmartLocation[]>([]);
  const lastFlushTimeRef = useRef<number>(Date.now());
  const lastLocationRef = useRef<SmartLocation | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isMovingRef = useRef<boolean>(false);
  const lastMovementTimeRef = useRef<number>(0);

  // Dwell Detection: Track when stationary for >5 seconds
  const stationaryStartTimeRef = useRef<number | null>(null);
  const DWELL_THRESHOLD_MS = 5000; // 5 seconds
  const DWELL_SPEED_THRESHOLD_MPS = 1.5; // 1.5 m/s (5.4 km/h)
  // FIX: Use ref instead of state for isDwelling to avoid stale closure issue
  // The handleLocationUpdate callback captures state at creation time, but refs are always current
  const isDwellingRef = useRef<boolean>(false);

  // Smoothed position for reducing GPS jitter
  const smoothedPositionRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Smoothed speed for consistent display (prevents UI jitter)
  const smoothedSpeedRef = useRef<number>(0);

  // Track recent high-speed samples for sustained max speed detection
  const highSpeedSamplesRef = useRef<number[]>([]);

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
          pointsToSnap[i - 1].latitude, pointsToSnap[i - 1].longitude,
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
            newSnappedPoints[i - 1].latitude, newSnappedPoints[i - 1].longitude,
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

  // Track recent points for GPS-based speed calculation
  const recentPointsRef = useRef<{ lat: number; lng: number; timestamp: number }[]>([]);

  // Handle new location update
  const handleLocationUpdate = useCallback((location: Location.LocationObject) => {
    const { latitude, longitude, speed, heading, accuracy } = location.coords;
    const timestamp = location.timestamp;
    const now = Date.now();

    // Filter out low-accuracy GPS readings (likely jitter)
    if (accuracy && accuracy > MIN_ACCURACY_FOR_DISTANCE) {
      console.warn(`[SmartTracking] Ignoring low-accuracy GPS reading: ${accuracy.toFixed(1)}m`);
      return;
    }

    // Apply exponential smoothing to position to reduce jitter
    let smoothedLat = latitude;
    let smoothedLng = longitude;

    if (smoothedPositionRef.current) {
      smoothedLat = smoothedPositionRef.current.latitude + POSITION_SMOOTHING_FACTOR * (latitude - smoothedPositionRef.current.latitude);
      smoothedLng = smoothedPositionRef.current.longitude + POSITION_SMOOTHING_FACTOR * (longitude - smoothedPositionRef.current.longitude);
    }
    smoothedPositionRef.current = { latitude: smoothedLat, longitude: smoothedLng };

    // Calculate speed from GPS position changes (more accurate than device-reported)
    let calculatedSpeedMps = 0;

    // Add current point to recent points (use smoothed position)
    recentPointsRef.current.push({ lat: smoothedLat, lng: smoothedLng, timestamp: now });

    // Remove points outside calculation window
    recentPointsRef.current = recentPointsRef.current.filter(
      p => (now - p.timestamp) <= SPEED_CALC_WINDOW_MS
    );

    // Calculate speed from GPS if we have enough points
    if (recentPointsRef.current.length >= 2) {
      const oldest = recentPointsRef.current[0];
      const newest = recentPointsRef.current[recentPointsRef.current.length - 1];
      const timeDeltaSeconds = (newest.timestamp - oldest.timestamp) / 1000;
      const distanceKm = calculateDistance(oldest.lat, oldest.lng, newest.lat, newest.lng);
      const distanceMeters = distanceKm * 1000;

      // IMPROVED FILTERING: Only calculate speed if we have enough time AND distance
      // This prevents GPS jitter at very low speeds from causing speed spikes
      // At low speeds, GPS error of 2-3 meters over short time causes huge calculated speeds
      const hasEnoughTime = timeDeltaSeconds >= MIN_TIME_DELTA_FOR_SPEED_CALC;
      const hasEnoughDistance = distanceMeters >= MIN_DISTANCE_FOR_SPEED_CALC;

      if (hasEnoughTime && hasEnoughDistance) {
        calculatedSpeedMps = distanceMeters / timeDeltaSeconds;

        // Validate speed is reasonable - cap at MAX_REASONABLE_SPEED_MPS (250 km/h)
        // This prevents GPS drift/jitter from causing insane top speed readings
        if (calculatedSpeedMps < 0 || calculatedSpeedMps > MAX_REASONABLE_SPEED_MPS) {
          calculatedSpeedMps = 0;
        }

        // Additional validation: if distance moved is very small but time is long,
        // we're probably stationary and the "movement" is just GPS jitter
        if (distanceMeters < 5 && timeDeltaSeconds > 5) {
          calculatedSpeedMps = 0;
        }
      } else if (hasEnoughTime && !hasEnoughDistance) {
        // Haven't moved enough - probably stationary with GPS jitter
        calculatedSpeedMps = 0;
      }
    }

    // Use GPS-calculated speed as primary source - no fallback guessing for accuracy
    // Only use device-reported speed when accuracy is excellent
    const reportedSpeedMps = speed || 0;
    let finalSpeedMps = calculatedSpeedMps;

    // Only trust device speed if GPS calculation unavailable AND accuracy is excellent
    if (finalSpeedMps <= 0 && accuracy && accuracy < 15 && reportedSpeedMps > 0) {
      finalSpeedMps = reportedSpeedMps;
    }

    // 1. Dwell Detection Filter - Track stationary time (check BEFORE filtering)
    // Must check finalSpeedMps (unfiltered) to correctly detect speeds up to threshold
    if (finalSpeedMps < DWELL_SPEED_THRESHOLD_MPS) {
      // User is stationary
      if (stationaryStartTimeRef.current === null) {
        // Just became stationary - start timer
        stationaryStartTimeRef.current = now;
      } else {
        // Check if we've been stationary for >5 seconds
        const stationaryDuration = now - stationaryStartTimeRef.current;
        if (stationaryDuration >= DWELL_THRESHOLD_MS && !isDwellingRef.current) {
          isDwellingRef.current = true;
        }
      }
    } else {
      // User is moving - reset dwell detection
      if (stationaryStartTimeRef.current !== null) {
        stationaryStartTimeRef.current = null;
      }
      if (isDwellingRef.current) {
        isDwellingRef.current = false;
      }
    }

    // 2. Drift Filter (Local Physics)
    // If calculated speed is below threshold, force it to 0 to prevent "ghost movement"
    const filteredSpeed = finalSpeedMps < STATIONARY_SPEED_THRESHOLD ? 0 : finalSpeedMps;

    // Apply Dwell Filter: If dwelling (stationary >5s), force speed to 0 for display
    const preSmoothedSpeed = isDwellingRef.current ? 0 : filteredSpeed;

    // Apply exponential smoothing to speed for smooth UI display
    // This prevents jarring speed jumps between readings
    let displaySpeedMps: number;
    if (preSmoothedSpeed === 0) {
      // Quickly drop to 0 when stopped
      displaySpeedMps = smoothedSpeedRef.current * 0.3; // Decay faster
      if (displaySpeedMps < 0.5) displaySpeedMps = 0;
    } else {
      // IMPROVED: Use stronger smoothing at low speeds to prevent jitter
      // At low speeds, GPS accuracy issues cause more relative error
      const smoothingFactor = preSmoothedSpeed < LOW_SPEED_THRESHOLD_MPS
        ? LOW_SPEED_EXTRA_SMOOTHING  // More aggressive smoothing at low speeds
        : SPEED_SMOOTHING_FACTOR;    // Normal smoothing at higher speeds

      displaySpeedMps = smoothedSpeedRef.current + smoothingFactor * (preSmoothedSpeed - smoothedSpeedRef.current);
    }
    smoothedSpeedRef.current = displaySpeedMps;

    const smartLoc: SmartLocation = {
      latitude,
      longitude,
      speed: displaySpeedMps, // Use smoothed speed for UI
      heading: heading || 0,
      timestamp,
      accuracy: accuracy || 0
    };

    setLiveRawLocation(smartLoc);
    lastLocationRef.current = smartLoc;

    // Update Max Speed with sustained speed detection
    // Require multiple samples at high speed to prevent single GPS spikes from inflating max
    if (filteredSpeed > 0) {
      const speedKmh = filteredSpeed * 3.6;

      // Track high-speed samples
      if (speedKmh > maxSpeed * 0.9 || speedKmh > 50) {
        // This is a high reading - track it
        highSpeedSamplesRef.current.push(speedKmh);
        // Keep only last 5 samples
        if (highSpeedSamplesRef.current.length > 5) {
          highSpeedSamplesRef.current.shift();
        }

        // Only update max if we have consistent high readings (sustained speed)
        const recentHighSamples = highSpeedSamplesRef.current.filter(s => s >= speedKmh * 0.85);
        if (recentHighSamples.length >= MAX_SPEED_SAMPLES_REQUIRED && speedKmh > maxSpeed) {
          // Use the median of recent samples for stability
          const sorted = [...recentHighSamples].sort((a, b) => a - b);
          const medianSpeed = sorted[Math.floor(sorted.length / 2)];
          setMaxSpeed(Math.max(maxSpeed, medianSpeed));
        }
      } else {
        // Clear high speed samples when speed drops significantly
        if (highSpeedSamplesRef.current.length > 0 && speedKmh < maxSpeed * 0.5) {
          highSpeedSamplesRef.current = [];
        }
      }
    }

    // 3. Moving Time Calculation
    // Only count moving time when NOT dwelling (using filteredSpeed, not displaySpeed)
    if (filteredSpeed > 0 && !isDwellingRef.current) {
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

    // 4. Buffering
    // Only buffer if we have moved (not dwelling) - this ensures Roads API gets accurate path
    if (filteredSpeed > 0 && !isDwellingRef.current) {
      bufferRef.current.push(smartLoc);
    }

    // 5. Check Flush Conditions
    if (
      bufferRef.current.length >= BUFFER_SIZE ||
      (Date.now() - lastFlushTimeRef.current > FLUSH_INTERVAL_MS && bufferRef.current.length > 0)
    ) {
      flushBufferToRoadsAPI();
    }

  }, [flushBufferToRoadsAPI]);

  // Track previous isTracking state to detect new journey starts
  const prevIsTrackingRef = useRef<boolean>(false);

  // Start/Stop Tracking
  useEffect(() => {
    if (isTracking) {
      // CRITICAL: Reset all tracking state when starting a NEW journey
      // This prevents distance/stats from carrying over from previous journey
      if (!prevIsTrackingRef.current) {
        console.log('[SmartTracking] New journey detected - resetting all tracking state');
        setOfficialDistance(0);
        setMovingTime(0);
        setMaxSpeed(0);
        setOfficialSnappedPath([]);
        setLiveRawLocation(null);
        isDwellingRef.current = false;

        // Reset all refs
        bufferRef.current = [];
        lastFlushTimeRef.current = Date.now();
        lastLocationRef.current = null;
        isMovingRef.current = false;
        lastMovementTimeRef.current = 0;
        stationaryStartTimeRef.current = null;
        smoothedPositionRef.current = null;
        smoothedSpeedRef.current = 0;
        highSpeedSamplesRef.current = [];
        recentPointsRef.current = [];
      }
      prevIsTrackingRef.current = true;

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
      prevIsTrackingRef.current = false;
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
