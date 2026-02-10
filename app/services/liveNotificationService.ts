// app/services/liveNotificationService.ts
// Cross-platform live journey notifications
// Android: Uses notifee for ongoing notification (expo-location provides the foreground service)
// iOS: Uses expo-live-activity for Live Activities and Dynamic Island

import { Platform } from 'react-native';
import notifee, {
    AndroidImportance,
    AndroidStyle,
    EventType,
} from '@notifee/react-native';
import * as Location from 'expo-location';

import * as ActivityController from '../modules/activity-controller';

// Channel ID for journey tracking
const CHANNEL_ID = 'journey-tracking';
const NOTIFICATION_ID = 'journey-live';

// Track if channel has been initialized
let channelInitialized = false;

// Reverse geocode cache to avoid excessive API calls
let lastGeocodedCoords: { lat: number; lon: number } | null = null;
let lastGeocodedName: string | null = null;
let lastGeocodeTime = 0;
const GEOCODE_THROTTLE_MS = 15000; // Only reverse geocode every 15 seconds
const GEOCODE_DISTANCE_THRESHOLD = 0.0005; // ~50m change to trigger re-geocode

// CRITICAL: Register notifee foreground service runner at module level
// This MUST be called before any displayNotification with asForegroundService: true
// Without this, Android throws CannotPostForegroundServiceNotificationException
if (Platform.OS === 'android') {
    notifee.registerForegroundService(() => {
        return new Promise(() => {
            // This promise intentionally never resolves.
            // The foreground service stays alive until stopForegroundService() is called.
            // notifee handles the lifecycle automatically.
        });
    });
}



// Journey data interface for notifications
export interface JourneyNotificationData {
    journeyId: string;
    startTime: number;
    totalDistance: number; // km
    currentSpeed: number; // km/h
    avgSpeed: number; // km/h
    topSpeed: number; // km/h
    movingTime: number; // seconds
    // Progress tracking
    progress: number; // 0-1
    distanceRemaining?: number; // km
    // Location names
    startLocationName?: string;
    destinationName?: string;
    // Current position for progress
    currentLatitude?: number;
    currentLongitude?: number;
    // Unit preference
    units?: 'km' | 'mi';
}

// Initialize the notification channel (Android)
// MUST be called early in app lifecycle (e.g., _layout.tsx mount)
// to avoid CannotPostForegroundServiceNotificationException on Android 14+
export async function initializeNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (channelInitialized) return; // Avoid redundant calls

    try {
        // Create the notification channel BEFORE any foreground service notification is posted
        await notifee.createChannel({
            id: CHANNEL_ID,
            name: 'Journey Tracking',
            description: 'Real-time journey progress notifications',
            importance: AndroidImportance.HIGH,
            lights: false,
            vibration: false,
            sound: undefined,
        });
        channelInitialized = true;
        console.log('[LiveNotification] Android notification channel created successfully');
    } catch (error) {
        console.error('[LiveNotification] Failed to create notification channel:', error);
    }
}

// Format duration for display
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// Create progress bar visualization for notification (matching iOS car-progress style)
function createVisualProgress(progress: number): string {
    const totalBlocks = 20;
    const filledBlocks = Math.min(Math.round(progress * totalBlocks), totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return `📍${'━'.repeat(filledBlocks)}🚗${'─'.repeat(emptyBlocks)}🏁`;
}

// Convert distance for notification display
function formatNotificationDistance(km: number, units: 'km' | 'mi' = 'km'): string {
    if (units === 'mi') {
        const miles = km * 0.621371;
        return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
    }
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Convert speed for notification display
function formatNotificationSpeed(kmh: number, units: 'km' | 'mi' = 'km'): string {
    if (units === 'mi') {
        return `${(kmh * 0.621371).toFixed(0)} mph`;
    }
    return `${kmh.toFixed(0)} km/h`;
}

// Reverse geocode coordinates to a location name (throttled + cached)
async function resolveLocationName(latitude?: number, longitude?: number): Promise<string | null> {
    if (!latitude || !longitude) return null;

    const now = Date.now();

    // Check if we should reuse cached result
    if (lastGeocodedCoords && lastGeocodedName) {
        const timeSinceLastGeocode = now - lastGeocodeTime;
        const latDiff = Math.abs(latitude - lastGeocodedCoords.lat);
        const lonDiff = Math.abs(longitude - lastGeocodedCoords.lon);

        // Reuse if within throttle window and position hasn't changed much
        if (timeSinceLastGeocode < GEOCODE_THROTTLE_MS ||
            (latDiff < GEOCODE_DISTANCE_THRESHOLD && lonDiff < GEOCODE_DISTANCE_THRESHOLD)) {
            return lastGeocodedName;
        }
    }

    try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (results && results.length > 0) {
            const place = results[0];
            // Build a short location name: street name, district, or city
            let name = '';
            if (place.street) {
                name = place.street;
            } else if (place.district) {
                name = place.district;
            } else if (place.subregion) {
                name = place.subregion;
            } else if (place.city) {
                name = place.city;
            } else if (place.region) {
                name = place.region;
            }

            if (name) {
                // Cache the result
                lastGeocodedCoords = { lat: latitude, lon: longitude };
                lastGeocodedName = name;
                lastGeocodeTime = now;
                return name;
            }
        }
    } catch (error) {
        // Silently fail — notification will use fallback
    }

    return null;
}

// Build the Android notification content to match iOS Live Activity detail level
function buildAndroidNotificationContent(data: JourneyNotificationData, currentLocationName: string | null): {
    title: string;
    body: string;
    bigText: string;
} {
    const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
    const elapsedFormatted = formatDuration(elapsed);
    const units = data.units || 'km';

    // Title: Origin → Destination (matching iOS header)
    const origin = currentLocationName || data.startLocationName || 'En Route';
    const destination = data.destinationName || 'Destination';
    const title = `${origin} → ${destination}`;

    // Compact body (shown when notification is collapsed)
    const speedDisplay = formatNotificationSpeed(data.currentSpeed, units);
    const distDisplay = formatNotificationDistance(data.totalDistance, units);
    const body = `${speedDisplay}  •  ${distDisplay}  •  ⏱ ${elapsedFormatted}`;

    // Big text (shown when notification is expanded — matches iOS Lock Screen detail)
    const progressBar = createVisualProgress(data.progress);
    const progressPct = Math.round(data.progress * 100);

    let bigText = '';

    // Line 1: Visual progress bar with percentage
    bigText += `${progressBar} ${progressPct}%`;

    // Line 2: Distance remaining (if available)
    if (data.distanceRemaining && data.distanceRemaining > 0) {
        bigText += `\n📌 ${formatNotificationDistance(data.distanceRemaining, units)} remaining`;
    }

    // Line 3: Main stats row (matching iOS footer)
    bigText += `\n⏱ ${elapsedFormatted}  •  📏 ${distDisplay}`;

    // Line 4: Speed stats (matching iOS detail — avg speed, top speed, current speed)
    bigText += `\n🏎 ${speedDisplay}`;
    if (data.avgSpeed > 0) {
        bigText += `  •  Avg: ${formatNotificationSpeed(data.avgSpeed, units)}`;
    }
    if (data.topSpeed > 0) {
        bigText += `  •  Top: ${formatNotificationSpeed(data.topSpeed, units)}`;
    }

    // Line 5: Current location
    if (currentLocationName) {
        bigText += `\n📍 ${currentLocationName}`;
    }

    return { title, body, bigText };
}

// Shared helper to build notifee Android config
function buildAndroidConfig(title: string, body: string, bigText: string, data: JourneyNotificationData, smallIcon: string) {
    return {
        id: NOTIFICATION_ID,
        title,
        body,
        android: {
            channelId: CHANNEL_ID,
            asForegroundService: true,
            ongoing: true,
            onlyAlertOnce: true,
            smallIcon,
            color: '#FF6B00',
            pressAction: {
                id: 'open-journey',
                launchActivity: 'default',
            },
            style: {
                type: AndroidStyle.BIGTEXT as const,
                text: bigText,
            },
            progress: {
                max: 100,
                current: Math.round(data.progress * 100),
                indeterminate: false,
            },
            timestamp: data.startTime,
            showTimestamp: true,
            chronometerDirection: 'up' as const,
            showChronometer: true,
        },
    };
}

// Start or update the journey notification (Android)
export async function updateJourneyNotification(data: JourneyNotificationData): Promise<void> {
    if (Platform.OS !== 'android') {
        await updateIOSLiveActivity(data);
        return;
    }

    // Resolve the current location name (throttled, non-blocking)
    const currentLocationName = await resolveLocationName(data.currentLatitude, data.currentLongitude);

    const { title, body, bigText } = buildAndroidNotificationContent(data, currentLocationName);

    // Ensure channel exists before posting notification
    if (!channelInitialized) {
        await initializeNotificationChannel();
    }

    try {
        await notifee.displayNotification(
            buildAndroidConfig(title, body, bigText, data, 'ic_notification')
        );
    } catch (error: any) {
        // If ic_notification is missing, retry with the default launcher icon
        if (error?.message?.includes('small icon') || error?.message?.includes('Invalid notification')) {
            console.warn('[LiveNotification] ic_notification drawable missing, falling back to ic_launcher');
            await notifee.displayNotification(
                buildAndroidConfig(title, body, bigText, data, 'ic_launcher')
            );
        } else {
            console.error('[LiveNotification] Failed to display notification:', error);
        }
    }
}

// Stop the journey notification
export async function dismissJourneyNotification(): Promise<void> {
    if (Platform.OS === 'android') {
        // Clear geocode cache on journey end
        lastGeocodedCoords = null;
        lastGeocodedName = null;
        lastGeocodeTime = 0;

        try {
            await notifee.stopForegroundService();
        } catch (e) {
            // Foreground service may not be running if we used regular notification
            console.warn('[LiveNotification] stopForegroundService failed (may not be running):', e);
        }
        try {
            await notifee.cancelNotification(NOTIFICATION_ID);
        } catch (e) {
            console.warn('[LiveNotification] cancelNotification failed:', e);
        }
    } else {
        await endIOSLiveActivity();
    }
}

// iOS Live Activity implementation using local ActivityController module
async function updateIOSLiveActivity(data: JourneyNotificationData): Promise<void> {
    try {
        // Check if activities are enabled/supported
        if (!ActivityController.areLiveActivitiesEnabled()) {
            return;
        }

        const elapsed = Math.floor((Date.now() - data.startTime) / 1000);

        // Content state for the Live Activity (dynamic, updatable data)
        const contentState: ActivityController.JourneyContentState = {
            elapsedTime: elapsed,
            totalDistance: data.totalDistance,
            currentSpeed: data.currentSpeed,
            progress: data.progress,
            distanceRemaining: data.distanceRemaining || 0,
        };

        const isRunning = ActivityController.isLiveActivityRunning();

        if (isRunning) {
            // Update existing Live Activity
            await ActivityController.updateLiveActivity(contentState);
            console.log('[LiveNotification] iOS Live Activity updated');
        } else {
            // Start new Live Activity
            const attributes: ActivityController.JourneyAttributes = {
                journeyId: data.journeyId,
                startLocationName: data.startLocationName || 'Start',
                destinationName: data.destinationName || 'Destination',
                startTime: data.startTime, // timestamp in ms
            };

            await ActivityController.startLiveActivity({
                ...attributes,
                contentState,
            });
            console.log('[LiveNotification] iOS Live Activity started');
        }
    } catch (error) {
        console.error('[LiveNotification] iOS Live Activity error:', error);
    }
}

async function endIOSLiveActivity(): Promise<void> {
    try {
        if (ActivityController.isLiveActivityRunning()) {
            await ActivityController.stopLiveActivity();
            console.log('[LiveNotification] iOS Live Activity ended');
        }
    } catch (error) {
        console.error('[LiveNotification] Error ending iOS Live Activity:', error);
    }
}

// Handle notification events
export function setupNotificationEventHandlers(): void {
    notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.PRESS) {
            console.log('[LiveNotification] Notification pressed:', detail.notification?.id);
        }
    });

    notifee.onBackgroundEvent(async ({ type, detail }) => {
        if (type === EventType.PRESS) {
            console.log('[LiveNotification] Background notification pressed:', detail.notification?.id);
        }
    });
}

const LiveNotificationService = {
    initializeChannel: initializeNotificationChannel,
    updateNotification: updateJourneyNotification,
    dismissNotification: dismissJourneyNotification,
    setupEventHandlers: setupNotificationEventHandlers,
};

export default LiveNotificationService;
