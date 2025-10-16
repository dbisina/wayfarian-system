// app/services/LocationService.ts
// GPS location tracking and journey management

import * as Location from 'expo-location';
import { journeyAPI } from './api';

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
  avgSpeed: number; // km/h
  topSpeed: number; // km/h
  currentSpeed: number; // km/h
}

class LocationService {
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking: boolean = false;
  private routePoints: LocationPoint[] = [];
  private currentJourneyId: string | null = null;
  private stats: JourneyStats = {
    totalDistance: 0,
    totalTime: 0,
    avgSpeed: 0,
    topSpeed: 0,
    currentSpeed: 0,
  };
  private startTime: number = 0;
  private lastUpdateTime: number = 0;
  private updateInterval: number = 5000; // Update backend every 5 seconds

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
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      
      if (backgroundStatus !== 'granted') {
        console.warn('Background location permission denied - tracking will stop when app is backgrounded');
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

      // Create journey in backend
      const response = await journeyAPI.startJourney({
        startLatitude: startLocation.latitude,
        startLongitude: startLocation.longitude,
        vehicle,
        title,
        groupId,
      });

      this.currentJourneyId = response.journey.id;
      this.isTracking = true;
      this.startTime = Date.now();
      this.lastUpdateTime = Date.now();
      this.routePoints = [startLocation];
      
      // Reset stats
      this.stats = {
        totalDistance: 0,
        totalTime: 0,
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

    // Calculate distance from last point
    if (this.routePoints.length > 0) {
      const lastPoint = this.routePoints[this.routePoints.length - 1];
      const distance = this.calculateDistance(
        lastPoint.latitude,
        lastPoint.longitude,
        newPoint.latitude,
        newPoint.longitude
      );

      this.stats.totalDistance += distance;
    }

    // Update speed stats
    const speedKmh = (newPoint.speed || 0) * 3.6; // Convert m/s to km/h
    this.stats.currentSpeed = speedKmh;
    if (speedKmh > this.stats.topSpeed) {
      this.stats.topSpeed = speedKmh;
    }

    // Update time
    this.stats.totalTime = Math.floor((Date.now() - this.startTime) / 1000);

    // Calculate average speed
    if (this.stats.totalTime > 0) {
      this.stats.avgSpeed = (this.stats.totalDistance / this.stats.totalTime) * 3600; // km/h
    }

    // Add point to route
    this.routePoints.push(newPoint);

    // Update backend periodically
    const now = Date.now();
    if (now - this.lastUpdateTime >= this.updateInterval) {
      await this.updateBackend();
      this.lastUpdateTime = now;
    }
  }

  // Update backend with current journey data
  private async updateBackend() {
    if (!this.currentJourneyId) return;

    try {
      const currentLocation = this.routePoints[this.routePoints.length - 1];
      
      await journeyAPI.updateJourney(this.currentJourneyId, {
        currentLatitude: currentLocation.latitude,
        currentLongitude: currentLocation.longitude,
        currentSpeed: this.stats.currentSpeed,
        routePoints: this.routePoints,
      });
    } catch (error) {
      console.error('Error updating journey:', error);
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
      // Final update
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
      this.routePoints = [];
      this.stats = {
        totalDistance: 0,
        totalTime: 0,
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
}

// Export singleton instance
export const locationService = new LocationService();
export default locationService;