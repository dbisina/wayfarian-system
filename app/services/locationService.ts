// app/services/LocationService.ts
// GPS location tracking and journey management

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { journeyAPI } from './api';
import { LOCATION_TASK_NAME } from './backgroundTasks';
import { defaultKalmanFilter } from './kalmanFilter';
import { snapToRoads } from './roads';

// Movement filtering thresholds to reduce GPS jitter when stationary
const MIN_ACCURACY_METERS = 10; // low-accuracy threshold
const MIN_MOVE_METERS = 3; // minimum movement to count towards distance
const STATIONARY_SPEED_THRESHOLD_MPS = 0.3; // treat as stationary if below ~1 km/h
const MAX_ACCURACY_THRESHOLD = 60; // Ignore points with accuracy worse than this
const CURRENT_JOURNEY_ID_KEY = 'wayfarian_current_journey_id';
const CURRENT_GROUP_ID_KEY = 'wayfarian_current_group_id';
const MIN_TIME_DELTA_FOR_SPEED_CALC = 0.5; // Minimum seconds needed for accurate speed calculation
const MAX_REASONABLE_SPEED_MPS = 139; // 500 km/h in m/s - only filter extreme GPS jitter outliers
const JITTER_ACCURACY_MULTIPLIER = 0.5; // distance must be > accuracy * mutliplier to count as movement

export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed?: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
}

export interface JourneyStats {
  totalDistance: number; // in kilometers
  totalTime: number; // in seconds
  movingTime: number; // in seconds (only when actually moving)
  avgSpeed: number; // km/h
  topSpeed: number; // km/h
  currentSpeed: number; // km/h
}

class LocationService {
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking: boolean = false;
  private routePoints: LocationPoint[] = [];
  private currentJourneyId: string | null = null;
  private currentGroupId: string | null = null;
  private lastKnownLocation: LocationPoint | null = null;
  private listeners: ((point: LocationPoint, stats: JourneyStats) => void)[] = [];

  constructor() {
    this.hydrateState();
  }

  private async hydrateState() {
    try {
      const persistedId = await AsyncStorage.getItem(CURRENT_JOURNEY_ID_KEY);
      const persistedGroupId = await AsyncStorage.getItem(CURRENT_GROUP_ID_KEY);
      if (persistedId) {
        this.currentJourneyId = persistedId;
        this.currentGroupId = persistedGroupId;
        // Optimization: check if background task is actually running
        const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        this.isTracking = isRunning;
        console.log(`[LocationService] Hydrated state: ${persistedId} (Tracking: ${isRunning})`);
      }
    } catch (e) {
      console.warn('[LocationService] Failed to hydrate state:', e);
    }
  }
  private stats: JourneyStats = {
    totalDistance: 0,
    totalTime: 0,
    movingTime: 0,
    avgSpeed: 0,
    topSpeed: 0,
    currentSpeed: 0,
  };
  private startTime: number = 0;
  private lastUpdateTime: number = 0;
  private lastMovementTime: number = 0; // Track last time we were moving
  private isCurrentlyMoving: boolean = false;

  private updateInterval: number = 3000; // Update backend every 3 seconds for lower perceived latency
  // GPS-based speed calculation: track recent points for accurate speed calculation
  private recentPoints: { point: LocationPoint; timestamp: number }[] = [];
  private readonly SPEED_CALCULATION_WINDOW_MS = 3000; // Use last 3 seconds of points for speed calculation
  private readonly MIN_SPEED_CALC_POINTS = 2; // Need at least 2 points to calculate speed

  // Calculate distance between two points using Haversine formula
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
      Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Request location permissions
  async requestPermissions(): Promise<boolean> {
    try {
      let foregroundStatus = (await Location.getForegroundPermissionsAsync()).status;
      if (foregroundStatus !== 'granted') {
        foregroundStatus = (await Location.requestForegroundPermissionsAsync()).status;
      }

      if (foregroundStatus !== 'granted') {
        console.error('Foreground location permission denied');
        return false;
      }

      // Request background permission for continuous tracking
      // IMPORTANT: Expo Go on iOS cannot add Info.plist keys, so this call will throw.
      // Only request background permission on iOS when running a standalone/dev client build.
      try {
        const isExpoGo = Constants.appOwnership === 'expo';
        const allowBackgroundOnIOS = Platform.OS === 'ios' && !isExpoGo; // standalone/dev builds only
        if (Platform.OS === 'android' || allowBackgroundOnIOS) {
          const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
          if (backgroundStatus !== 'granted') {
            console.warn('Background location permission denied - tracking will pause in background');
          }
        }
      } catch (e) {
        // Swallow Info.plist errors on Expo Go iOS and continue with foreground tracking
        console.warn('Background permission request skipped:', (e as any)?.message || e);
      }

      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  // Get current location
  async getCurrentLocation(): Promise<LocationPoint | null> {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: location.timestamp,
        speed: location.coords.speed || 0,
        altitude: location.coords.altitude || 0,
        accuracy: location.coords.accuracy || 0,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  }

  // Start journey tracking
  async startJourney(vehicle?: string, title?: string, groupId?: string): Promise<string | null> {
    try {
      // Check permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permissions not granted');
      }

      // Get starting location
      const startLocation = await this.getCurrentLocation();
      if (!startLocation) {
        throw new Error('Could not get current location');
      }

      // Create journey in backend only (no offline fallback)
      const response = await journeyAPI.startJourney({
        startLatitude: startLocation.latitude,
        startLongitude: startLocation.longitude,
        vehicle,
        title,
        groupId,
      });
      if (!response || !response.journey?.id) {
        throw new Error('Backend unavailable: failed to start journey');
      }
      const journeyId: string = response.journey.id;

      this.currentJourneyId = journeyId;
      this.currentGroupId = groupId || null;

      // Persist for background activity recovery
      await AsyncStorage.setItem(CURRENT_JOURNEY_ID_KEY, journeyId);
      if (groupId) {
        await AsyncStorage.setItem(CURRENT_GROUP_ID_KEY, groupId);
      }

      this.isTracking = true;
      this.startTime = Date.now();
      this.lastUpdateTime = Date.now();
      this.lastMovementTime = Date.now();
      this.isCurrentlyMoving = false;
      this.routePoints = [startLocation];
      this.recentPoints = []; // Initialize recent points for speed calculation

      // Reset stats
      this.stats = {
        totalDistance: 0,
        totalTime: 0,
        movingTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
      };

      // Start OS-level background location tracking (True Native Services)
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        // Crucial for Automotive focus
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: true, // Native auto-pause when stationary
        foregroundService: {
          notificationTitle: "Wayfarian Active",
          notificationBody: "Tracking your journey in the background",
          notificationColor: "#ff7f50", // Wayfarian orange
        }
      });

      return this.currentJourneyId;
    } catch (error) {
      console.error('Error starting journey:', error);
      return null;
    }
  }

  // Start offline journey tracking (when backend is unavailable)
  // Offline journey is disabled by product requirements
  async startOfflineJourney(): Promise<string | null> {
    console.warn('Offline journey is disabled');
    return null;
  }

  // Public access point for Background TaskManager
  public async processRawLocation(location: Location.LocationObject) {
    await this.handleLocationUpdate(location);
  }

  // Handle location updates
  private async handleLocationUpdate(location: Location.LocationObject) {
    if (!this.isTracking || !this.currentJourneyId) return;

    // Ignore points with poor accuracy
    if (location.coords.accuracy && location.coords.accuracy > MAX_ACCURACY_THRESHOLD) {
      return;
    }

    // Process through Kalman Filter to eliminate jitter and smooth the curve
    const smoothedPoint = defaultKalmanFilter.process(
      location.coords.latitude,
      location.coords.longitude,
      location.coords.accuracy || MIN_ACCURACY_METERS,
      location.timestamp
    );

    const newPoint: LocationPoint = {
      latitude: smoothedPoint.latitude,
      longitude: smoothedPoint.longitude,
      timestamp: location.timestamp,
      speed: location.coords.speed || 0,
      altitude: location.coords.altitude || 0,
      accuracy: location.coords.accuracy || 0,
    };

    // Always keep the latest reading
    this.lastKnownLocation = newPoint;

    // Calculate distance from last point
    let acceptPoint = false;
    let distanceKm = 0;
    if (this.routePoints.length > 0) {
      const lastPoint = this.routePoints[this.routePoints.length - 1];
      distanceKm = this.calculateDistance(
        lastPoint.latitude,
        lastPoint.longitude,
        newPoint.latitude,
        newPoint.longitude
      );
      const distanceMeters = distanceKm * 1000;
      const lastAcc = lastPoint.accuracy || 0;
      const currAcc = newPoint.accuracy || 0;
      // Require movement > 3m or half the current accuracy to filter minor jitter, instead of a strict 20m wall
      const minAcceptable = Math.max(MIN_MOVE_METERS, currAcc * 0.5);
      const reportedSpeed = newPoint.speed || 0;
      const isActuallyMoving = reportedSpeed >= STATIONARY_SPEED_THRESHOLD_MPS;

      // 1. We actually moved a significant distance (relative to accuracy), OR
      // 2. We're moving (speed > threshold) AND moved at least 3 meters (to avoid GPS drift)
      // This prevents adding distance when stationary
      const jitterThreshold = Math.max(MIN_MOVE_METERS, currAcc * JITTER_ACCURACY_MULTIPLIER);

      if (distanceMeters >= jitterThreshold || (isActuallyMoving && distanceMeters > 3)) {
        this.stats.totalDistance += distanceKm;
        acceptPoint = true;
      } else {
        // Don't accept point if we haven't moved enough - prevents drift accumulation
        acceptPoint = false;
      }
    } else {
      // Always accept the very first point
      acceptPoint = true;
    }

    // Calculate speed from GPS position changes (more accurate than reported speed)
    // Speed = Distance / Time using actual GPS coordinates
    let calculatedSpeedMps = 0;
    const now = Date.now();

    // Add current point to recent points for speed calculation
    this.recentPoints.push({ point: newPoint, timestamp: now });

    // Remove points older than calculation window
    this.recentPoints = this.recentPoints.filter(
      p => (now - p.timestamp) <= this.SPEED_CALCULATION_WINDOW_MS
    );

    // Calculate speed from GPS position changes if we have enough points
    if (this.recentPoints.length >= this.MIN_SPEED_CALC_POINTS) {
      const oldestPoint = this.recentPoints[0];
      const newestPoint = this.recentPoints[this.recentPoints.length - 1];
      const timeDeltaSeconds = (newestPoint.timestamp - oldestPoint.timestamp) / 1000;

      // Only calculate speed if we have enough time elapsed to get accurate reading
      // With very short time deltas, GPS jitter causes unrealistically high speeds
      if (timeDeltaSeconds >= MIN_TIME_DELTA_FOR_SPEED_CALC) {
        // Calculate distance between oldest and newest point
        const gpsDistanceKm = this.calculateDistance(
          oldestPoint.point.latitude,
          oldestPoint.point.longitude,
          newestPoint.point.latitude,
          newestPoint.point.longitude
        );
        const gpsDistanceMeters = gpsDistanceKm * 1000;

        // Speed = Distance / Time (in m/s)
        calculatedSpeedMps = gpsDistanceMeters / timeDeltaSeconds;

        // Validate speed is reasonable - cap at MAX_REASONABLE_SPEED_MPS (250 km/h)
        // This prevents GPS drift/jitter from causing insane top speed readings
        if (calculatedSpeedMps < 0 || calculatedSpeedMps > MAX_REASONABLE_SPEED_MPS) {
          calculatedSpeedMps = 0;
        }
      }
    }

    // Use GPS-calculated speed as primary source - no fallback guessing for accuracy
    // Only use device-reported speed when GPS accuracy is excellent (<15m)
    const reportedSpeedMps = newPoint.speed || 0;
    let finalSpeedMps = calculatedSpeedMps;

    // Only trust device speed if GPS calculation unavailable AND accuracy is excellent
    if (finalSpeedMps <= 0 && newPoint.accuracy && newPoint.accuracy < 15 && reportedSpeedMps > 0) {
      finalSpeedMps = reportedSpeedMps;
    }

    // Apply stationary threshold filter
    const moving = finalSpeedMps >= STATIONARY_SPEED_THRESHOLD_MPS;

    const speedKmh = finalSpeedMps * 3.6; // Convert m/s to km/h
    this.stats.currentSpeed = moving ? speedKmh : 0; // Standard: stats uses km/h for UI binding

    // Track moving time only when actually moving
    if (moving) {
      if (!this.isCurrentlyMoving) {
        // Just started moving again
        this.lastMovementTime = now;
        this.isCurrentlyMoving = true;
      } else {
        // Continue moving - add elapsed time
        const elapsedMs = now - this.lastMovementTime;
        this.stats.movingTime += Math.floor(elapsedMs / 1000);
        this.lastMovementTime = now;
      }

      // Update top speed only when moving (use actual speed, not display speed)
      const actualSpeedKmh = finalSpeedMps * 3.6;
      if (actualSpeedKmh > this.stats.topSpeed) {
        this.stats.topSpeed = actualSpeedKmh;
      }
    } else {
      this.isCurrentlyMoving = false;
    }

    // Update total time (includes stationary time)
    this.stats.totalTime = Math.floor((now - this.startTime) / 1000);

    // Calculate average speed based on moving time only
    if (this.stats.movingTime > 0) {
      const calculatedAvgSpeed = (this.stats.totalDistance / this.stats.movingTime) * 3600; // km/h
      // No artificial caps - return actual calculated average
      this.stats.avgSpeed = calculatedAvgSpeed;
    } else {
      this.stats.avgSpeed = 0;
    }

    // Add point to route only if accepted (filters out jitter when stationary)
    if (acceptPoint) {
      this.routePoints.push(newPoint);
    }

    // Share with listeners (UI state updates)
    this.notifyListeners(newPoint);

    // Update backend periodically
    const updateTimestamp = Date.now();
    if (updateTimestamp - this.lastUpdateTime >= this.updateInterval) {
      await this.updateBackend();
      this.lastUpdateTime = updateTimestamp;
    }

    // Also share live location with group via socket when in a group journey
    if (this.currentGroupId) {
      try {
        const { shareGroupLocation } = await import('./socket');
        shareGroupLocation({
          latitude: newPoint.latitude,
          longitude: newPoint.longitude,
          speed: this.stats.currentSpeed / 3.6, // EMIT m/s TO SOCKET
        });
      } catch {
        // Non-blocking
      }
    }
  }

  // central broadcasting for UI hooks
  private notifyListeners(point: LocationPoint) {
    const stats = this.getStats();
    this.listeners.forEach(cb => {
      try { cb(point, stats); } catch (e) { console.error('[LocationService] Listener error', e); }
    });
  }

  public subscribe(callback: (point: LocationPoint, stats: JourneyStats) => void): () => void {
    this.listeners.push(callback);
    // Immediately provide current state
    if (this.lastKnownLocation) {
      callback(this.lastKnownLocation, this.getStats());
    }
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // Update backend with current journey data
  private async updateBackend() {
    if (!this.currentJourneyId) return;

    try {
      const currentLocation = this.lastKnownLocation || this.routePoints[this.routePoints.length - 1];

      await journeyAPI.updateJourney(this.currentJourneyId, {
        currentLatitude: currentLocation.latitude,
        currentLongitude: currentLocation.longitude,
        currentSpeed: this.stats.currentSpeed / 3.6, // EMIT m/s TO API
      });
    } catch (error) {
      console.warn('Backend update failed, continuing offline:', error);
    }
  }

  // Pause journey
  async pauseJourney(): Promise<void> {
    if (!this.currentJourneyId) return;

    try {
      this.isTracking = false;

      // Stop background task instead of removing subscription
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);

      // Clear recent points when pausing
      this.recentPoints = [];
      this.stats.currentSpeed = 0;

      await journeyAPI.pauseJourney(this.currentJourneyId);
    } catch (error) {
      console.error('Error pausing journey:', error);
    }
  }

  // Resume journey
  async resumeJourney(): Promise<void> {
    if (!this.currentJourneyId) return;

    try {
      this.isTracking = true;
      this.startTime = Date.now() - (this.stats.totalTime * 1000);

      // Restart True OS-level background location tracking
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: true,
        foregroundService: {
          notificationTitle: "Wayfarian Active",
          notificationBody: "Tracking your journey in the background",
          notificationColor: "#ff7f50",
        }
      });

      await journeyAPI.resumeJourney(this.currentJourneyId);
    } catch (error) {
      console.error('Error resuming journey:', error);
    }
  }

  // End journey
  async endJourney(): Promise<void> {
    if (!this.currentJourneyId) return;

    try {
      // Final backend update
      await this.updateBackend();

      const currentLocation = this.routePoints[this.routePoints.length - 1];

      // Calculate "Perfect" Final Distance using Road Snapping
      let finalDistance = this.stats.totalDistance;
      try {
        if (this.routePoints.length > 1) {
          console.log(`[LocationService] Snapping ${this.routePoints.length} points to roads for final accuracy...`);
          // Snap the points to roads (batch of up to 100 points or use interpolation)
          const snappedPoints = await snapToRoads(this.routePoints.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude
          })));

          if (snappedPoints.length > 1) {
            let snappedDist = 0;
            for (let i = 1; i < snappedPoints.length; i++) {
              snappedDist += this.calculateDistance(
                snappedPoints[i - 1].latitude,
                snappedPoints[i - 1].longitude,
                snappedPoints[i].latitude,
                snappedPoints[i].longitude
              );
            }
            console.log(`[LocationService] Road snapped distance: ${snappedDist.toFixed(2)}km (Raw: ${finalDistance.toFixed(2)}km)`);
            finalDistance = snappedDist;
          }
        }
      } catch (e) {
        console.warn('[LocationService] Road snapping failed at end, using raw distance:', e);
      }

      await journeyAPI.endJourney(this.currentJourneyId, {
        endLatitude: currentLocation.latitude,
        endLongitude: currentLocation.longitude,
        totalDistance: finalDistance,
        totalTime: this.stats.totalTime,
      });

      // Stop Background Task
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      await AsyncStorage.removeItem(CURRENT_JOURNEY_ID_KEY);
      await AsyncStorage.removeItem(CURRENT_GROUP_ID_KEY);
      defaultKalmanFilter.reset();

      this.isTracking = false;
      this.currentJourneyId = null;
      this.currentGroupId = null;
      this.routePoints = [];
      this.recentPoints = []; // Clear recent points for speed calculation
      this.isCurrentlyMoving = false;
      this.lastMovementTime = 0;
      this.stats = {
        totalDistance: 0,
        totalTime: 0,
        movingTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
      };
    } catch (error) {
      console.error('Error ending journey:', error);
    }
  }

  // Get current stats
  getStats(): JourneyStats {
    // Ensure time keeps ticking, but only count moving time when actually moving
    if (this.isTracking && this.startTime > 0) {
      const now = Date.now();
      this.stats.totalTime = Math.floor((now - this.startTime) / 1000);

      // If currently moving, add the elapsed time since last movement update
      if (this.isCurrentlyMoving && this.lastMovementTime > 0) {
        const additionalMovingMs = now - this.lastMovementTime;
        const currentMovingTime = this.stats.movingTime + Math.floor(additionalMovingMs / 1000);

        // Calculate avg speed based on moving time - no artificial caps
        if (currentMovingTime > 0) {
          const calculatedAvgSpeed = (this.stats.totalDistance / currentMovingTime) * 3600;
          this.stats.avgSpeed = calculatedAvgSpeed;
        }
      } else if (this.stats.movingTime > 0) {
        // Not currently moving, use stored moving time - no artificial caps
        const calculatedAvgSpeed = (this.stats.totalDistance / this.stats.movingTime) * 3600;
        this.stats.avgSpeed = calculatedAvgSpeed;
      }
    }
    return { ...this.stats };
  }

  // Get route points
  getRoutePoints(): LocationPoint[] {
    return [...this.routePoints];
  }

  // Check if currently tracking
  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }

  // Get current journey ID
  getCurrentJourneyId(): string | null {
    return this.currentJourneyId;
  }

  // Check if current journey is offline
  isOfflineJourney(): boolean {
    return this.currentJourneyId ? this.currentJourneyId.startsWith('offline_') : false;
  }
}

// Export singleton instance
export const locationService = new LocationService();
export default locationService;