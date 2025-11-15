// app/services/LocationService.ts
// GPS location tracking and journey management

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { journeyAPI } from './api';

// Movement filtering thresholds to reduce GPS jitter when stationary
const MIN_ACCURACY_METERS = 25; // ignore low-accuracy updates over this threshold
const MIN_MOVE_METERS = 8; // minimum movement to count towards distance
const STATIONARY_SPEED_THRESHOLD_MPS = 0.5; // below this m/s, treat as stationary

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
  private updateInterval: number = 5000; // Update backend every 5 seconds
  private currentGroupId: string | null = null;

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
      // Accept if moved more than accuracy and threshold, or if reported speed indicates movement
      if (distanceMeters >= minAcceptable || (newPoint.speed || 0) >= STATIONARY_SPEED_THRESHOLD_MPS) {
        this.stats.totalDistance += distanceKm;
        acceptPoint = true;
      }
    } else {
      // Always accept the very first point
      acceptPoint = true;
    }

    // Update speed stats and track movement
    const speedMps = newPoint.speed || 0;
    const moving = speedMps >= STATIONARY_SPEED_THRESHOLD_MPS;
    const speedKmh = speedMps * 3.6; // Convert m/s to km/h
    this.stats.currentSpeed = moving ? speedKmh : 0;
    
    // Track moving time only when actually moving
    const now = Date.now();
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
      
      // Update top speed only when moving
      if (speedKmh > this.stats.topSpeed) {
        this.stats.topSpeed = speedKmh;
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