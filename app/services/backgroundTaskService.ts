// app/services/backgroundTaskService.ts
// Background location tracking with persistent notifications for journey continuation

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import LiveNotificationService, { JourneyNotificationData } from './liveNotificationService';

// Task name for background location tracking
const BACKGROUND_LOCATION_TASK = 'WAYFARIAN_BACKGROUND_LOCATION';
const JOURNEY_STATE_KEY = 'activeJourneyState';
const SETTINGS_UNITS_KEY = 'settings.units';
const NOTIFICATION_ID = 'journey-tracking-notification';

// Configuration constants
const MIN_MOVEMENT_THRESHOLD_M = 10; // Minimum movement to count (meters)
const MAX_REASONABLE_SPEED_MPS = 69.4; // 250 km/h in m/s
const MAX_SPEED_FOR_RECORDING_MPS = 0.5; // Speed threshold to count as moving (m/s)

// Journey state interface for persistence
export interface PersistedJourneyState {
    journeyId: string;
    startTime: number;
    totalDistance: number;
    movingTime: number;
    topSpeed: number;
    lastLatitude: number;
    lastLongitude: number;
    lastTimestamp: number;
    lastSpeed?: number; // Track last valid speed for validation
    recentHighSpeeds?: number[]; // Track recent high speed readings for sustained detection
    routePoints: Array<{
        latitude: number;
        longitude: number;
        timestamp: number;
        speed?: number;
    }>;
    // Buffered raw points for later Roads API snapping
    rawPointsBuffer: Array<{
        latitude: number;
        longitude: number;
        timestamp: number;
        speed?: number;
    }>;
    // Destination info for Uber-style progress
    startLocationName?: string;
    destinationName?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    estimatedTotalDistance?: number; // Total expected journey distance in km
}

// Define the background location task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error) {
        console.error('[BackgroundTask] Error:', error);
        return;
    }

    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };

        if (locations && locations.length > 0) {
            const location = locations[locations.length - 1];

            try {
                // Load persisted journey state
                const stateJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
                if (!stateJson) return;

                const state: PersistedJourneyState = JSON.parse(stateJson);

                // Calculate distance from last point
                if (state.lastLatitude && state.lastLongitude) {
                    const distanceKm = calculateHaversineDistance(
                        state.lastLatitude,
                        state.lastLongitude,
                        location.coords.latitude,
                        location.coords.longitude
                    );

                    const distanceMeters = distanceKm * 1000;
                    const timeDelta = (location.timestamp - state.lastTimestamp) / 1000;
                    const reportedSpeed = location.coords.speed || 0;

                    // Calculate implied speed from position change
                    const impliedSpeedMps = timeDelta > 0 ? distanceMeters / timeDelta : 0;

                    // Validate: Skip if implied speed is impossible (GPS jitter)
                    const isReasonableSpeed = impliedSpeedMps <= MAX_REASONABLE_SPEED_MPS;
                    const hasSignificantMovement = distanceMeters > MIN_MOVEMENT_THRESHOLD_M;

                    if (hasSignificantMovement && isReasonableSpeed) {
                        state.totalDistance += distanceKm;

                        // Add to route points (for polyline display)
                        state.routePoints.push({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            timestamp: location.timestamp,
                            speed: reportedSpeed,
                        });

                        // Also buffer raw point for later Roads API snapping
                        if (!state.rawPointsBuffer) {
                            state.rawPointsBuffer = [];
                        }
                        state.rawPointsBuffer.push({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            timestamp: location.timestamp,
                            speed: reportedSpeed,
                        });

                        // Update top speed - use the lower of reported and implied (more accurate)
                        // Sustained speed detection: require 2 consecutive high readings
                        const validatedSpeedMps = Math.min(Math.max(reportedSpeed, 0), impliedSpeedMps > 0 ? impliedSpeedMps : reportedSpeed);
                        const speedKmh = Math.abs(validatedSpeedMps) * 3.6;

                        // Initialize recentHighSpeeds if needed
                        if (!state.recentHighSpeeds) {
                            state.recentHighSpeeds = [];
                        }

                        // Only consider high speeds (above 50% of current max or above 30 km/h)
                        if (speedKmh > state.topSpeed * 0.5 || speedKmh > 30) {
                            state.recentHighSpeeds.push(speedKmh);
                            // Keep only last 3 readings
                            if (state.recentHighSpeeds.length > 3) {
                                state.recentHighSpeeds.shift();
                            }

                            // Update top speed only if we have 2+ consistent high readings
                            if (state.recentHighSpeeds.length >= 2) {
                                const minRecent = Math.min(...state.recentHighSpeeds);
                                const maxRecent = Math.max(...state.recentHighSpeeds);
                                // Check readings are consistent (within 30% of each other)
                                if (minRecent > maxRecent * 0.7 && speedKmh > state.topSpeed && speedKmh < 250) {
                                    // Use median for stability
                                    const sorted = [...state.recentHighSpeeds].sort((a, b) => a - b);
                                    const median = sorted[Math.floor(sorted.length / 2)];
                                    state.topSpeed = Math.max(state.topSpeed, median);
                                }
                            }
                        } else {
                            // Speed dropped - clear high speed buffer
                            state.recentHighSpeeds = [];
                        }

                        // Calculate moving time only if actually moving
                        if (validatedSpeedMps > MAX_SPEED_FOR_RECORDING_MPS) {
                            state.movingTime += timeDelta;
                        }

                        state.lastSpeed = validatedSpeedMps;
                    } else if (!isReasonableSpeed) {
                        console.warn(`[BackgroundTask] Filtered GPS jitter: ${impliedSpeedMps.toFixed(1)} m/s implied from ${distanceMeters.toFixed(1)}m in ${timeDelta.toFixed(1)}s`);
                    }
                }

                // Update last known location
                state.lastLatitude = location.coords.latitude;
                state.lastLongitude = location.coords.longitude;
                state.lastTimestamp = location.timestamp;

                // Persist updated state
                await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(state));

                // Update notification
                await updateTrackingNotification(state);

            } catch (e) {
                console.error('[BackgroundTask] Failed to process location:', e);
            }
        }
    }
});

// Haversine distance calculation
function calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Format duration for notification
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// Create visual progress bar for notification
function createProgressBar(progress: number): string {
    const totalBlocks = 10;
    const filledBlocks = Math.min(Math.round(progress * totalBlocks), totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return '▓'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

// Get units preference from AsyncStorage
async function getUnitsPreference(): Promise<'km' | 'mi'> {
    try {
        const units = await AsyncStorage.getItem(SETTINGS_UNITS_KEY);
        return units === 'mi' ? 'mi' : 'km';
    } catch {
        return 'km';
    }
}

// Update the persistent tracking notification with Uber-style progress
async function updateTrackingNotification(state: PersistedJourneyState) {
    try {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const avgSpeed = state.movingTime > 0
            ? (state.totalDistance / state.movingTime) * 3600
            : 0;

        // Calculate distance remaining if we have a destination
        let distanceRemaining = 0;
        let progress = 0;
        if (state.destinationLatitude && state.destinationLongitude) {
            distanceRemaining = calculateHaversineDistance(
                state.lastLatitude,
                state.lastLongitude,
                state.destinationLatitude,
                state.destinationLongitude
            );

            // Calculate progress if we have estimated total distance
            if (state.estimatedTotalDistance && state.estimatedTotalDistance > 0) {
                progress = Math.min(state.totalDistance / state.estimatedTotalDistance, 1);
            }
        }

        // Get units preference for notification display
        const units = await getUnitsPreference();

        // Use new live notification service for enhanced Android notifications
        const notificationData: JourneyNotificationData = {
            journeyId: state.journeyId,
            startTime: state.startTime,
            totalDistance: state.totalDistance,
            currentSpeed: (state.lastSpeed || 0) * 3.6, // Convert m/s to km/h
            avgSpeed,
            topSpeed: state.topSpeed,
            movingTime: state.movingTime,
            progress,
            distanceRemaining: distanceRemaining > 0 ? distanceRemaining : undefined,
            startLocationName: state.startLocationName,
            destinationName: state.destinationName,
            currentLatitude: state.lastLatitude,
            currentLongitude: state.lastLongitude,
            units,
        };

        await LiveNotificationService.updateNotification(notificationData);
    } catch (e) {
        console.warn('[BackgroundTask] Failed to update notification:', e);
        // Fallback to simple notification if live notification fails
        await fallbackToSimpleNotification(state);
    }
}

// Fallback notification using expo-notifications (simpler format)
async function fallbackToSimpleNotification(state: PersistedJourneyState) {
    try {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        await Notifications.scheduleNotificationAsync({
            identifier: NOTIFICATION_ID,
            content: {
                title: 'Journey in Progress',
                body: `${state.totalDistance.toFixed(2)} km • ${formatDuration(elapsed)}`,
                data: { type: 'JOURNEY_TRACKING', journeyId: state.journeyId },
                sticky: true,
                sound: false,
            },
            trigger: null,
        });
    } catch (e) {
        console.warn('[BackgroundTask] Fallback notification also failed:', e);
    }
}

// Start background location tracking with optional destination info
export interface BackgroundTrackingOptions {
    startLocationName?: string;
    destinationName?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    estimatedTotalDistance?: number;
    // CRITICAL: Pass startTime from foreground to ensure timer sync
    // This fixes Android issue where timer starts at wrong value
    startTime?: number;
}

export async function startBackgroundTracking(
    journeyId: string,
    options?: BackgroundTrackingOptions
): Promise<boolean> {
    try {
        // Check if background location is available
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            console.warn('[BackgroundTask] Background location permission not granted');
            return false;
        }

        // Get current location for initial state
        const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
        });

        // Create initial persisted state with destination info
        // CRITICAL: Use passed startTime for timer sync between foreground and background
        // This ensures Android timer doesn't start at wrong value
        const syncedStartTime = options?.startTime || Date.now();
        const initialState: PersistedJourneyState = {
            journeyId,
            startTime: syncedStartTime,
            totalDistance: 0,
            movingTime: 0,
            topSpeed: 0,
            lastLatitude: currentLocation.coords.latitude,
            lastLongitude: currentLocation.coords.longitude,
            lastTimestamp: currentLocation.timestamp,
            routePoints: [{
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                timestamp: currentLocation.timestamp,
                speed: 0,
            }],
            // Buffer for raw points to snap to roads later
            rawPointsBuffer: [{
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                timestamp: currentLocation.timestamp,
                speed: 0,
            }],
            // Include destination info if provided
            startLocationName: options?.startLocationName,
            destinationName: options?.destinationName,
            destinationLatitude: options?.destinationLatitude,
            destinationLongitude: options?.destinationLongitude,
            estimatedTotalDistance: options?.estimatedTotalDistance,
        };

        // Persist initial state
        await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(initialState));

        // Initialize notification channel (for notifee on Android)
        await LiveNotificationService.initializeChannel();

        // Get units preference
        const units = await getUnitsPreference();

        // Show initial notification via live notification service
        const initialNotificationData: JourneyNotificationData = {
            journeyId,
            startTime: initialState.startTime,
            totalDistance: 0,
            currentSpeed: 0,
            avgSpeed: 0,
            topSpeed: 0,
            movingTime: 0,
            progress: 0,
            distanceRemaining: options?.estimatedTotalDistance,
            startLocationName: options?.startLocationName,
            destinationName: options?.destinationName,
            currentLatitude: initialState.lastLatitude,
            currentLongitude: initialState.lastLongitude,
            units,
        };
        await LiveNotificationService.updateNotification(initialNotificationData);

        // Start background location updates
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000, // Update every 5 seconds
            distanceInterval: 10, // Or every 10 meters
            foregroundService: {
                notificationTitle: options?.destinationName
                    ? `Heading to ${options.destinationName}`
                    : 'Wayfarian Journey',
                notificationBody: 'Tracking your journey...',
                notificationColor: '#F9A825',
            },
            pausesUpdatesAutomatically: false,
            activityType: Location.ActivityType.AutomotiveNavigation,
        });

        console.log('[BackgroundTask] Started background tracking for journey:', journeyId);
        return true;

    } catch (error) {
        console.error('[BackgroundTask] Failed to start background tracking:', error);
        return false;
    }
}

// Stop background location tracking
export async function stopBackgroundTracking(): Promise<PersistedJourneyState | null> {
    try {
        // Check if task is running
        const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

        if (isRunning) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }

        // Dismiss notification via live notification service
        await LiveNotificationService.dismissNotification();
        // Also try to cancel any expo-notifications fallback
        await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => { });

        // Get persisted state
        const stateJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        const state: PersistedJourneyState | null = stateJson ? JSON.parse(stateJson) : null;

        // Clear persisted state
        await AsyncStorage.removeItem(JOURNEY_STATE_KEY);

        console.log('[BackgroundTask] Stopped background tracking');
        return state;

    } catch (error) {
        console.error('[BackgroundTask] Failed to stop background tracking:', error);
        return null;
    }
}

// Check if background tracking is active
export async function isBackgroundTrackingActive(): Promise<boolean> {
    try {
        return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
        return false;
    }
}

// Get persisted journey state (for recovery)
export async function getPersistedJourneyState(): Promise<PersistedJourneyState | null> {
    try {
        const stateJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        return stateJson ? JSON.parse(stateJson) : null;
    } catch {
        return null;
    }
}

// Recover journey state after app restart
export async function recoverJourneyState(): Promise<PersistedJourneyState | null> {
    const state = await getPersistedJourneyState();

    if (state) {
        // Check if journey is still active (background task running)
        const isActive = await isBackgroundTrackingActive();

        if (!isActive) {
            // Journey was interrupted - clear state
            await AsyncStorage.removeItem(JOURNEY_STATE_KEY);
            return null;
        }
    }

    return state;
}

// Get buffered raw points from background tracking for Roads API snapping
export async function getBufferedBackgroundPoints(): Promise<Array<{ latitude: number; longitude: number; timestamp: number; speed?: number }>> {
    try {
        const state = await getPersistedJourneyState();
        return state?.rawPointsBuffer || [];
    } catch {
        return [];
    }
}

// Clear the background buffer after processing (call after snapping to Roads API)
export async function clearBackgroundBuffer(): Promise<void> {
    try {
        const stateJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        if (!stateJson) return;

        const state: PersistedJourneyState = JSON.parse(stateJson);
        state.rawPointsBuffer = [];
        await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('[BackgroundTask] Failed to clear buffer:', e);
    }
}

// Get current background distance (for merging with foreground)
export async function getBackgroundDistance(): Promise<number> {
    try {
        const state = await getPersistedJourneyState();
        return state?.totalDistance || 0;
    } catch {
        return 0;
    }
}

export default {
    startBackgroundTracking,
    stopBackgroundTracking,
    isBackgroundTrackingActive,
    getPersistedJourneyState,
    recoverJourneyState,
    getBufferedBackgroundPoints,
    clearBackgroundBuffer,
    getBackgroundDistance,
    BACKGROUND_LOCATION_TASK,
};
