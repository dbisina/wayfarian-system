// Device speed is the primary source; Roads API corrects the path and distance;
// Haversine accumulates distance in real-time and serves as the offline fallback.

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { StatsCalculator } from '../utils/StatsCalculator';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ROADS_API_BASE_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const BUFFER_SIZE = 8;
const FLUSH_INTERVAL_MS = 10000;

// 0.3 m/s catches slow uphill cycling without reacting to GPS jitter at rest.
const STATIONARY_SPEED_THRESHOLD_MPS = 0.3;
const DWELL_SPEED_THRESHOLD_MPS = 1.0;
const DWELL_THRESHOLD_MS = 5000;

const MAX_REASONABLE_SPEED_MPS = 55.5; // 200 km/h absolute ceiling
const MAX_ACCELERATION_MPS2 = 8.0;
const SPEED_SMOOTHING_FACTOR = 0.4;
// 0.7 means ~3 missed samples to halve displayed speed, preventing visible drops on a single bad GPS tick.
const SPEED_DECAY_FACTOR = 0.7;

type VehicleKind = 'car' | 'bike' | 'scooter';

/** Per-vehicle top-speed cap in km/h. Samples above this are treated as GPS glitches. */
const VEHICLE_MAX_SPEED_KMH: Record<VehicleKind, number> = {
  car: 180,
  bike: 50,
  scooter: 80,
};

const MIN_ACCURACY_FOR_TRACKING = 30;
const MAX_DISTANCE_BETWEEN_POINTS_KM = 0.5;
const MIN_DISTANCE_FOR_ACCUMULATION_M = 3;
const JITTER_ACCURACY_MULTIPLIER = 0.5;
const MIN_MOVE_METERS_FOR_SPEED = 2;

const MAX_SPEED_SAMPLES_REQUIRED = 4;

// Matches the Redux routePoints cap and the background-task cap so all three
// pipelines stay consistent. The previous 5000-point limit was always truncated
// to 2000 by Redux before rendering, keeping ~80 KB of heap alive unnecessarily.
const MAX_SNAPPED_PATH_POINTS = 2000;

/** Haversine great-circle distance between two WGS-84 coordinates. Returns kilometres. */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** A single GPS fix after smoothing and heading stabilisation. Speed is in m/s. */
export interface SmartLocation {
  latitude: number;
  longitude: number;
  speed: number; // m/s
  heading: number;
  timestamp: number;
  accuracy: number;
}

/** A coordinate snapped to the road network by the Google Roads API. */
export interface SnappedPoint {
  location: {
    latitude: number;
    longitude: number;
  };
  originalIndex: number;
  placeId: string;
}

/**
 * Real-time journey tracking hook that combines device GPS, Google Roads API
 * snapping, and Haversine fallback into a single stream of stats.
 *
 * @param isTracking - Start/stop the location subscription. Toggling from false→true resets all accumulators.
 * @param vehicle - Determines the per-vehicle speed cap used for glitch rejection.
 * @returns Live location, snapped path, distance (km), moving time (s), avg speed (km/h), max speed (km/h).
 */
export function useSmartTracking(isTracking: boolean, vehicle: VehicleKind = 'car') {
  const vehicleSpeedCapKmh = VEHICLE_MAX_SPEED_KMH[vehicle] ?? VEHICLE_MAX_SPEED_KMH.car;
  const [liveRawLocation, setLiveRawLocation] = useState<SmartLocation | null>(null);
  const [officialSnappedPath, setOfficialSnappedPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [officialDistance, setOfficialDistance] = useState<number>(0); // km
  const [movingTime, setMovingTime] = useState<number>(0); // seconds
  const [maxSpeed, setMaxSpeed] = useState<number>(0); // km/h
  const maxSpeedRef = useRef<number>(0);

  const bufferRef = useRef<SmartLocation[]>([]);
  const lastFlushTimeRef = useRef<number>(Date.now());
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isMovingRef = useRef<boolean>(false);
  const lastMovementTimeRef = useRef<number>(0);

  const haversineDistanceRef = useRef<number>(0); // km — accumulated from raw GPS
  const lastAccumulationPointRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  const roadsApiDistanceRef = useRef<number>(0); // km — from snapped points
  const roadsApiActiveRef = useRef<boolean>(false); // true after first successful Roads API call

  const stationaryStartTimeRef = useRef<number | null>(null);
  const isDwellingRef = useRef<boolean>(false);

  const previousSpeedRef = useRef<number>(0);
  const previousSpeedTimeRef = useRef<number>(0);
  const smoothedSpeedRef = useRef<number>(0);
  const highSpeedSamplesRef = useRef<number[]>([]);

  // Alpha scales with speed and accuracy: fast + accurate → trust new point;
  // slow + noisy → hold steady. Cuts "dancing marker" drift at rest without visible lag while riding.
  const smoothedPositionRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastGoodHeadingRef = useRef<number>(0);
  const lastPositionTimestampRef = useRef<number>(0);

  /** Send the buffered GPS points to the Roads API and update the snapped path + distance. */
  const flushBufferToRoadsAPI = useCallback(async () => {
    if (bufferRef.current.length < 2) return;

    const pointsToSnap = [...bufferRef.current];
    // Retain last point so the next segment connects without a gap.
    const lastPoint = pointsToSnap[pointsToSnap.length - 1];
    bufferRef.current = [lastPoint];
    lastFlushTimeRef.current = Date.now();

    if (!GOOGLE_MAPS_API_KEY) {
      setOfficialSnappedPath(prev => {
        const merged = [...prev, ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))];
        return merged.length > MAX_SNAPPED_PATH_POINTS ? merged.slice(-MAX_SNAPPED_PATH_POINTS) : merged;
      });
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

        setOfficialSnappedPath(prev => {
          const merged = [...prev, ...newSnappedPoints];
          return merged.length > MAX_SNAPPED_PATH_POINTS ? merged.slice(-MAX_SNAPPED_PATH_POINTS) : merged;
        });

        let segmentDist = 0;
        for (let i = 1; i < newSnappedPoints.length; i++) {
          segmentDist += haversineDistance(
            newSnappedPoints[i - 1].latitude, newSnappedPoints[i - 1].longitude,
            newSnappedPoints[i].latitude, newSnappedPoints[i].longitude
          );
        }
        roadsApiDistanceRef.current += segmentDist;
        roadsApiActiveRef.current = true;

        // Taking max(Roads API, Haversine) keeps the display monotonic: a mid-journey
        // Roads API correction (e.g. 1.05 km → 0.95 km snapped) would otherwise visibly
        // shrink the odometer, which users notice immediately.
        setOfficialDistance(Math.max(roadsApiDistanceRef.current, haversineDistanceRef.current));
      } else {
        setOfficialSnappedPath(prev => {
          const merged = [...prev, ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))];
          return merged.length > MAX_SNAPPED_PATH_POINTS ? merged.slice(-MAX_SNAPPED_PATH_POINTS) : merged;
        });
        setOfficialDistance(haversineDistanceRef.current);
      }
    } catch (error) {
      setOfficialSnappedPath(prev => {
        const merged = [...prev, ...pointsToSnap.map(p => ({ latitude: p.latitude, longitude: p.longitude }))];
        return merged.length > MAX_SNAPPED_PATH_POINTS ? merged.slice(-MAX_SNAPPED_PATH_POINTS) : merged;
      });
      setOfficialDistance(haversineDistanceRef.current);
    }
  }, []);

  /** Process a raw Expo location event, updating speed, position, distance, and time accumulators. */
  const handleLocationUpdate = useCallback((location: Location.LocationObject) => {
    const { latitude, longitude, speed: deviceSpeed, heading, accuracy } = location.coords;
    const timestamp = location.timestamp;
    const now = Date.now();

    if (accuracy && accuracy > MIN_ACCURACY_FOR_TRACKING) {
      return;
    }

    // === SPEED CALCULATION ===
    // GPS chips derive speed via Doppler shift — more accurate than position-delta at low sample rates.
    let rawSpeedMps = 0;

    if (deviceSpeed !== null && deviceSpeed !== undefined && deviceSpeed >= 0) {
      rawSpeedMps = deviceSpeed;
    }

    // When the device reports 0 or null, fall back to position-delta speed.
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
        if (calculatedSpeed > 0.3 && calculatedSpeed < MAX_REASONABLE_SPEED_MPS) {
          rawSpeedMps = calculatedSpeed;
        }
      }
    }

    if (rawSpeedMps > MAX_REASONABLE_SPEED_MPS) {
      rawSpeedMps = 0;
    }

    // Reject unrealistic speed jumps (cap acceleration, but never cap braking).
    if (previousSpeedTimeRef.current > 0 && rawSpeedMps > 0) {
      const timeSinceLastSpeed = (now - previousSpeedTimeRef.current) / 1000;
      if (timeSinceLastSpeed > 0.5) {
        const speedChange = Math.abs(rawSpeedMps - previousSpeedRef.current);
        const acceleration = speedChange / timeSinceLastSpeed;
        if (acceleration > MAX_ACCELERATION_MPS2 && rawSpeedMps > previousSpeedRef.current) {
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

    let displaySpeedMps: number;
    if (preSmoothedSpeed === 0) {
      displaySpeedMps = smoothedSpeedRef.current * SPEED_DECAY_FACTOR;
      if (displaySpeedMps < 0.3) displaySpeedMps = 0;
    } else {
      // Brake faster than accelerate to avoid speed-up lag feeling.
      const factor = preSmoothedSpeed < smoothedSpeedRef.current ? 0.5 : SPEED_SMOOTHING_FACTOR;
      displaySpeedMps = smoothedSpeedRef.current + factor * (preSmoothedSpeed - smoothedSpeedRef.current);
    }
    smoothedSpeedRef.current = displaySpeedMps;

    // === POSITION SMOOTHING ===
    let displayLat = latitude;
    let displayLng = longitude;
    if (smoothedPositionRef.current) {
      const accuracyPenalty = Math.min(1, (accuracy || 10) / 30); // 0 = perfect, 1 = borderline
      const speedBoost = Math.min(1, rawSpeedMps / 5); // ≥5 m/s → full trust in new point
      const alpha = Math.max(0.2, Math.min(0.85, 0.25 + speedBoost * 0.6 - accuracyPenalty * 0.15));
      displayLat = smoothedPositionRef.current.latitude + alpha * (latitude - smoothedPositionRef.current.latitude);
      displayLng = smoothedPositionRef.current.longitude + alpha * (longitude - smoothedPositionRef.current.longitude);
    }
    smoothedPositionRef.current = { latitude: displayLat, longitude: displayLng };

    // GPS heading is unreliable when stationary; only update once above a slow-walk threshold.
    // 0.8 m/s ≈ 3 km/h — low enough to track slow-speed turns.
    let displayHeading = lastGoodHeadingRef.current;
    if (heading !== null && heading !== undefined && heading >= 0 && rawSpeedMps > 0.8) {
      lastGoodHeadingRef.current = heading;
      displayHeading = heading;
    }
    lastPositionTimestampRef.current = timestamp;

    // === EMIT LOCATION ===
    const smartLoc: SmartLocation = {
      latitude: displayLat,
      longitude: displayLng,
      speed: displaySpeedMps,
      heading: displayHeading,
      timestamp,
      accuracy: accuracy || 0
    };
    setLiveRawLocation(smartLoc);

    // === MAX SPEED ===
    // Vehicle-aware cap + sustained-sample validation. Samples above the cap are
    // rejected outright (GPS glitch), and MAX_SPEED_SAMPLES_REQUIRED consecutive
    // readings must stay elevated before a new peak is promoted.
    if (filteredSpeed > 0) {
      const speedKmh = filteredSpeed * 3.6;
      if (speedKmh <= vehicleSpeedCapKmh) {
        const currentMax = maxSpeedRef.current;
        if (speedKmh > currentMax * 0.9 || speedKmh > 20) {
          highSpeedSamplesRef.current.push(speedKmh);
          if (highSpeedSamplesRef.current.length > 8) {
            highSpeedSamplesRef.current.shift();
          }
          const recentHighSamples = highSpeedSamplesRef.current.filter(s => s >= speedKmh * 0.85);
          if (recentHighSamples.length >= MAX_SPEED_SAMPLES_REQUIRED && speedKmh > currentMax) {
            const sorted = [...recentHighSamples].sort((a, b) => a - b);
            const medianSpeed = sorted[Math.floor(sorted.length / 2)];
            const newMax = Math.min(vehicleSpeedCapKmh, Math.max(currentMax, medianSpeed));
            maxSpeedRef.current = newMax;
            setMaxSpeed(newMax);
          }
        } else if (speedKmh < currentMax * 0.5) {
          highSpeedSamplesRef.current = [];
        }
      } else {
        // Sample exceeded the vehicle cap — GPS glitch, reset sustainment buffer.
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
        if (delta > 0 && delta < 30) { // cap at 30 s to swallow large gaps from app suspension
          setMovingTime(prev => prev + delta);
        }
        lastMovementTimeRef.current = now;
      }
    } else {
      isMovingRef.current = false;
    }

    // === DISTANCE ACCUMULATION (Haversine — real-time) ===
    // Gate on rawSpeedMps > 0.2, not filteredSpeed > 0, so slow pull-offs and
    // low-speed manoeuvring below the stationary threshold still accumulate.
    // The jitter filter on distMeters guards against GPS noise while truly stopped.
    if (lastAccumulationPointRef.current && rawSpeedMps > 0.2) {
      const distKm = haversineDistance(
        lastAccumulationPointRef.current.latitude,
        lastAccumulationPointRef.current.longitude,
        latitude,
        longitude
      );
      const distMeters = distKm * 1000;

      const minMoveMeters = Math.max(MIN_DISTANCE_FOR_ACCUMULATION_M, (accuracy || 10) * JITTER_ACCURACY_MULTIPLIER);

      if (distMeters >= minMoveMeters && distKm <= MAX_DISTANCE_BETWEEN_POINTS_KM) {
        haversineDistanceRef.current += distKm;

        if (!roadsApiActiveRef.current) {
          setOfficialDistance(haversineDistanceRef.current);
        }
      }
    }

    if (filteredSpeed > 0 || !lastAccumulationPointRef.current) {
      lastAccumulationPointRef.current = { latitude, longitude, timestamp: now };
    }

    // === BUFFERING FOR ROADS API ===
    const accuracyOk = !accuracy || accuracy <= MIN_ACCURACY_FOR_TRACKING;
    if (accuracyOk) {
      const lastBuffered = bufferRef.current[bufferRef.current.length - 1];
      let shouldBuffer = true;
      if (lastBuffered) {
        const distFromLast = haversineDistance(lastBuffered.latitude, lastBuffered.longitude, latitude, longitude) * 1000;
        shouldBuffer = distFromLast >= 2; // suppress duplicate stationary points
      }

      if (shouldBuffer) {
        bufferRef.current.push(smartLoc);
      }
    }

    if (
      bufferRef.current.length >= BUFFER_SIZE ||
      (Date.now() - lastFlushTimeRef.current > FLUSH_INTERVAL_MS && bufferRef.current.length > 1)
    ) {
      flushBufferToRoadsAPI();
    }

  }, [flushBufferToRoadsAPI]);

  const prevIsTrackingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isTracking) {
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

        haversineDistanceRef.current = 0;
        roadsApiDistanceRef.current = 0;
        roadsApiActiveRef.current = false;
        lastAccumulationPointRef.current = null;

        smoothedPositionRef.current = null;
        lastGoodHeadingRef.current = 0;
        lastPositionTimestampRef.current = 0;
      }
      prevIsTrackingRef.current = true;

      const start = async () => {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') {
          return;
        }

        // watchPositionAsync is used on all platforms. Previously Android used
        // locationService.subscribe(), but that path never fired because JourneyContext
        // owns isTracking — not locationService.
        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 500, // 2 Hz — at 60 km/h gives ~8 m between samples for fluid marker movement
            distanceInterval: 3,
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
    avgSpeed: StatsCalculator.calculateAverageSpeed(officialDistance, movingTime), // km/h
    maxSpeed: maxSpeed, // km/h
  };
}
