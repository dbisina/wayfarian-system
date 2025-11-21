// app/services/LocationService.ts
// GPS location tracking and journey management

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { journeyAPI } from './api';

// Movement filtering thresholds to reduce GPS jitter when stationary
const MIN_ACCURACY_METERS = 20; // ignore low-accuracy updates over this threshold
const MIN_MOVE_METERS = 10; // minimum movement to count towards distance
const STATIONARY_SPEED_THRESHOLD_MPS = 1.2; // below this m/s, treat as stationary (increased to ~4.3 km/h to reduce drift)
const MAX_ACCURACY_THRESHOLD = 100; // Ignore points with accuracy worse than this

export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed?: number;
  altitude?: number;
  accuracy?: number;
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
  private lastKnownLocation: LocationPoint | null = null;
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
  
  // Dwell Detection: Track when stationary for >5 seconds
  private stationaryStartTime: number | null = null;
  private readonly DWELL_THRESHOLD_MS = 5000; // 5 seconds
  private readonly DWELL_SPEED_THRESHOLD_MPS = 1.5; // 1.5 m/s (5.4 km/h)
  private isDwelling: boolean = false; // True when stationary >5s
  private updateInterval: number = 5000; // Update backend every 5 seconds
  private currentGroupId: string | null = null;
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
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
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
          const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
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

      // Start location tracking
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // Update every second
          distanceInterval: 5, // Update every 5 meters
        },
        (location) => {
          this.handleLocationUpdate(location);
        }
      );

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

  // Handle location updates
  private async handleLocationUpdate(location: Location.LocationObject) {
    if (!this.isTracking || !this.currentJourneyId) return;

    // Ignore points with poor accuracy
    if (location.coords.accuracy && location.coords.accuracy > MAX_ACCURACY_THRESHOLD) {
      return;
    }

    const newPoint: LocationPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
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
      const minAcceptable = Math.max(MIN_MOVE_METERS, MIN_ACCURACY_METERS, lastAcc, currAcc);
      const reportedSpeed = newPoint.speed || 0;
      const isActuallyMoving = reportedSpeed >= STATIONARY_SPEED_THRESHOLD_MPS;
      
      // Only accept point if:
      // 1. We actually moved a significant distance (more than accuracy threshold), OR
      // 2. We're moving (speed > threshold) AND moved at least 3 meters (to avoid GPS drift)
      // This prevents adding distance when stationary
      if (distanceMeters >= minAcceptable || (isActuallyMoving && distanceMeters > 3)) {
        // Only add distance if we actually moved AND not dwelling (prevents GPS drift accumulation)
        if (distanceMeters >= 3 && !this.isDwelling) {
          this.stats.totalDistance += distanceKm;
        }
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
      
      if (timeDeltaSeconds > 0) {
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
        
        // Validate calculated speed is reasonable (0-200 m/s = 0-720 km/h)
        if (calculatedSpeedMps < 0 || calculatedSpeedMps > 200) {
          calculatedSpeedMps = 0;
        }
      }
    }
    
    // Use GPS-calculated speed if available and reasonable, otherwise fall back to reported speed
    // GPS-calculated speed is often more accurate than device-reported speed
    const reportedSpeedMps = newPoint.speed || 0;
    let finalSpeedMps = 0;
    
    if (calculatedSpeedMps > 0) {
      // Use GPS-calculated speed as primary source
      finalSpeedMps = calculatedSpeedMps;
    } else if (reportedSpeedMps > 0 && reportedSpeedMps < 200) {
      // Fall back to reported speed if GPS calculation unavailable
      finalSpeedMps = reportedSpeedMps;
    }
    
    // Apply stationary threshold filter
    const moving = finalSpeedMps >= STATIONARY_SPEED_THRESHOLD_MPS;
    
    // Dwell Detection Filter - Track when stationary for >5 seconds
    if (finalSpeedMps < this.DWELL_SPEED_THRESHOLD_MPS) {
      // User is stationary
      if (this.stationaryStartTime === null) {
        // Just became stationary - start timer
        this.stationaryStartTime = now;
      } else {
        // Check if we've been stationary for >5 seconds
        const stationaryDuration = now - this.stationaryStartTime;
        if (stationaryDuration >= this.DWELL_THRESHOLD_MS) {
          this.isDwelling = true;
        }
      }
    } else {
      // User is moving - reset dwell detection
      if (this.stationaryStartTime !== null) {
        this.stationaryStartTime = null;
      }
      this.isDwelling = false;
    }
    
    // Apply Dwell Filter: If dwelling (stationary >5s), force speed to 0 for display
    const displaySpeedMps = this.isDwelling ? 0 : finalSpeedMps;
    const speedKmh = displaySpeedMps * 3.6; // Convert m/s to km/h
    this.stats.currentSpeed = this.isDwelling ? 0 : (moving ? speedKmh : 0);
    
    // Track moving time only when actually moving AND not dwelling
    if (moving && !this.isDwelling) {
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
      this.stats.avgSpeed = (this.stats.totalDistance / this.stats.movingTime) * 3600; // km/h
    } else {
      this.stats.avgSpeed = 0;
    }

    // Add point to route only if accepted (filters out jitter when stationary)
    if (acceptPoint) {
      this.routePoints.push(newPoint);
    }

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
          speed: this.stats.currentSpeed,
        });
      } catch {
        // Non-blocking
      }
    }
  }

  // Update backend with current journey data
  private async updateBackend() {
    if (!this.currentJourneyId) return;

    try {
      const currentLocation = this.lastKnownLocation || this.routePoints[this.routePoints.length - 1];
      
      await journeyAPI.updateJourney(this.currentJourneyId, {
        currentLatitude: currentLocation.latitude,
        currentLongitude: currentLocation.longitude,
        currentSpeed: this.stats.currentSpeed,
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
      
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }

      // Clear recent points when pausing
      this.recentPoints = [];
      this.stats.currentSpeed = 0;
      this.stationaryStartTime = null; // Reset dwell detection
      this.isDwelling = false;

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

      // Restart location tracking
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 5,
        },
        (location) => {
          this.handleLocationUpdate(location);
        }
      );

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
      
      await journeyAPI.endJourney(this.currentJourneyId, {
        endLatitude: currentLocation.latitude,
        endLongitude: currentLocation.longitude,
      });

      // Clean up
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }

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
        
        // Calculate avg speed based on moving time
        if (currentMovingTime > 0) {
          this.stats.avgSpeed = (this.stats.totalDistance / currentMovingTime) * 3600;
        }
      } else if (this.stats.movingTime > 0) {
        // Not currently moving, use stored moving time
        this.stats.avgSpeed = (this.stats.totalDistance / this.stats.movingTime) * 3600;
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