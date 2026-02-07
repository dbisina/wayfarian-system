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

import * as ActivityController from '../modules/activity-controller';

// Channel ID for journey tracking
const CHANNEL_ID = 'journey-tracking';
const NOTIFICATION_ID = 'journey-live';

// Track if channel has been initialized
let channelInitialized = false;

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

// Create progress bar visualization for notification
function createVisualProgress(progress: number): string {
    const totalBlocks = 15;
    const filledBlocks = Math.min(Math.round(progress * totalBlocks), totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return `○${'━'.repeat(filledBlocks)}${'─'.repeat(emptyBlocks)}◉`;
}

// Convert distance for notification display
function formatNotificationDistance(km: number, units: 'km' | 'mi' = 'km'): string {
    if (units === 'mi') {
        return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
}

// Convert speed for notification display
function formatNotificationSpeed(kmh: number, units: 'km' | 'mi' = 'km'): string {
    if (units === 'mi') {
        return `${(kmh * 0.621371).toFixed(0)} mph`;
    }
    return `${kmh.toFixed(0)} km/h`;
}

// Start or update the journey notification (Android)
export async function updateJourneyNotification(data: JourneyNotificationData): Promise<void> {
    if (Platform.OS !== 'android') {
        await updateIOSLiveActivity(data);
        return;
    }

    const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
    const elapsedFormatted = formatDuration(elapsed);

    let title = 'Journey in Progress';
    if (data.startLocationName && data.destinationName) {
        title = `${data.startLocationName} → ${data.destinationName}`;
    }

    const progressBar = createVisualProgress(data.progress);
    const units = data.units || 'km';
    let body = progressBar;

    if (data.distanceRemaining && data.distanceRemaining > 0) {
        body += `\n${formatNotificationDistance(data.distanceRemaining, units)} remaining`;
    }

    body += `\n${elapsedFormatted}  •  ${formatNotificationDistance(data.totalDistance, units)}  •  ${formatNotificationSpeed(data.currentSpeed, units)}`;

    // Ensure channel exists before posting notification
    if (!channelInitialized) {
        await initializeNotificationChannel();
    }

    await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title,
        body,
        android: {
            channelId: CHANNEL_ID,
            asForegroundService: true,
            ongoing: true,
            onlyAlertOnce: true,
            smallIcon: 'ic_notification',
            color: '#FF6B00',
            pressAction: {
                id: 'open-journey',
                launchActivity: 'default',
            },
            style: {
                type: AndroidStyle.BIGTEXT,
                text: body,
            },
            progress: {
                max: 100,
                current: Math.round(data.progress * 100),
                indeterminate: false,
            },
            timestamp: data.startTime,
            showTimestamp: true,
            chronometerDirection: 'up',
            showChronometer: true,
        },
    });
}

// Stop the journey notification
export async function dismissJourneyNotification(): Promise<void> {
    if (Platform.OS === 'android') {
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
