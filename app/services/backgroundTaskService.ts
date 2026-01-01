// app/services/backgroundTaskService.ts
// Background location tracking with persistent notifications for journey continuation

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Task name for background location tracking
const BACKGROUND_LOCATION_TASK = 'WAYFARIAN_BACKGROUND_LOCATION';
const JOURNEY_STATE_KEY = 'activeJourneyState';
const NOTIFICATION_ID = 'journey-tracking-notification';

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
    routePoints: Array<{
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

                    // Only add distance if significant movement (>5m)
                    if (distanceKm * 1000 > 5) {
                        state.totalDistance += distanceKm;

                        // Add to route points
                        state.routePoints.push({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            timestamp: location.timestamp,
                            speed: location.coords.speed || 0,
                        });

                        // Update top speed
                        const speedKmh = (location.coords.speed || 0) * 3.6;
                        if (speedKmh > state.topSpeed) {
                            state.topSpeed = speedKmh;
                        }

                        // Calculate moving time
                        const timeDelta = (location.timestamp - state.lastTimestamp) / 1000;
                        if (location.coords.speed && location.coords.speed > 1.2) {
                            state.movingTime += timeDelta;
                        }
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

        // Build notification body with Uber-style format
        let title = '🚗 Journey in Progress';
        let body = '';

        if (state.startLocationName && state.destinationName) {
            // Uber-style with origin → destination
            title = `${state.startLocationName} → ${state.destinationName}`;

            if (distanceRemaining > 0) {
                const progressBar = createProgressBar(progress);
                body = `${progressBar}\n📍 ${distanceRemaining.toFixed(1)} km remaining • ${state.totalDistance.toFixed(1)} km traveled`;
            } else {
                body = `📍 ${state.totalDistance.toFixed(2)} km traveled`;
            }
        } else {
            // Fallback without destination
            body = `📍 ${state.totalDistance.toFixed(2)} km • ⏱️ ${formatDuration(elapsed)}`;
        }

        // Add speed info
        if (avgSpeed > 0) {
            body += `\n⚡ Avg: ${avgSpeed.toFixed(0)} km/h`;
        }

        await Notifications.scheduleNotificationAsync({
            identifier: NOTIFICATION_ID,
            content: {
                title,
                body,
                data: {
                    type: 'JOURNEY_TRACKING',
                    journeyId: state.journeyId,
                    progress,
                    distanceRemaining,
                },
                sticky: true,
                sound: false,
            },
            trigger: null, // Show immediately
        });
    } catch (e) {
        console.warn('[BackgroundTask] Failed to update notification:', e);
    }
}

// Start background location tracking with optional destination info
export interface BackgroundTrackingOptions {
    startLocationName?: string;
    destinationName?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    estimatedTotalDistance?: number;
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
        const initialState: PersistedJourneyState = {
            journeyId,
            startTime: Date.now(),
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
            // Include destination info if provided
            startLocationName: options?.startLocationName,
            destinationName: options?.destinationName,
            destinationLatitude: options?.destinationLatitude,
            destinationLongitude: options?.destinationLongitude,
            estimatedTotalDistance: options?.estimatedTotalDistance,
        };

        // Persist initial state
        await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(initialState));

        // Create notification channel on Android
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('journey-tracking', {
                name: 'Journey Tracking',
                importance: Notifications.AndroidImportance.LOW,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                sound: null,
                vibrationPattern: null,
                enableVibrate: false,
            });
        }

        // Build initial notification
        let initialTitle = '🚗 Journey Started';
        let initialBody = 'Tracking your journey in the background...';

        if (options?.startLocationName && options?.destinationName) {
            initialTitle = `${options.startLocationName} → ${options.destinationName}`;
            if (options.estimatedTotalDistance) {
                initialBody = `📍 ${options.estimatedTotalDistance.toFixed(1)} km journey • Starting...`;
            }
        }

        // Show initial notification
        await Notifications.scheduleNotificationAsync({
            identifier: NOTIFICATION_ID,
            content: {
                title: initialTitle,
                body: initialBody,
                data: { type: 'JOURNEY_TRACKING', journeyId },
                sticky: true,
                sound: false,
            },
            trigger: null,
        });

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

        // Cancel notification
        await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);

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

export default {
    startBackgroundTracking,
    stopBackgroundTracking,
    isBackgroundTrackingActive,
    getPersistedJourneyState,
    recoverJourneyState,
    BACKGROUND_LOCATION_TASK,
};
