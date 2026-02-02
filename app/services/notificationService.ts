// app/services/notificationService.ts
// Service for handling push notifications with Expo

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiRequest } from './api';

// Configure notification behavior - called lazily to avoid startup crashes
let notificationHandlerConfigured = false;

export function initNotificationHandler(): void {
    if (notificationHandlerConfigured) return;
    notificationHandlerConfigured = true;

    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            // Enable banner and notification list on iOS for full notification experience
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
}

/**
 * Register for push notifications and get Expo push token
 * @returns Expo push token or null if registration fails
 */
export const registerForPushNotifications = async (): Promise<string | null> => {
    // Ensure notification handler is configured
    initNotificationHandler();

    try {
        // Check if running on a physical device
        if (!Device.isDevice) {
            console.log('[Notifications] Push notifications require a physical device');
            return null;
        }

        // Request permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[Notifications] Permission not granted for push notifications');
            return null;
        }

        // Get Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // From app.json or env
        });

        const token = tokenData.data;
        console.log('[Notifications] Expo push token:', token);

        // Register token with backend
        await registerTokenWithBackend(token);

        // Configure Android notification channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('journey-reminders', {
                name: 'Journey Reminders',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#6366f1',
                sound: 'default',
            });
        }

        return token;
    } catch (error) {
        console.error('[Notifications] Failed to register for push notifications:', error);
        return null;
    }
};

/**
 * Register push token with backend
 */
const registerTokenWithBackend = async (token: string): Promise<void> => {
    try {
        await apiRequest('/user/push-token', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
        console.log('[Notifications] Token registered with backend');
    } catch (error) {
        console.error('[Notifications] Failed to register token with backend:', error);
    }
};

/**
 * Unregister push token (call on logout)
 */
export const unregisterPushToken = async (): Promise<void> => {
    try {
        await apiRequest('/user/push-token', {
            method: 'DELETE',
        });
        console.log('[Notifications] Token removed from backend');
    } catch (error) {
        console.error('[Notifications] Failed to remove token from backend:', error);
    }
};

/**
 * Add listener for notification received while app is in foreground
 */
export const addNotificationReceivedListener = (
    callback: (notification: Notifications.Notification) => void
) => {
    return Notifications.addNotificationReceivedListener(callback);
};

/**
 * Add listener for when user interacts with a notification
 */
export const addNotificationResponseListener = (
    callback: (response: Notifications.NotificationResponse) => void
) => {
    return Notifications.addNotificationResponseReceivedListener(callback);
};

/**
 * Get the notification that caused the app to open (if any)
 */
export const getLastNotificationResponse = async () => {
    return await Notifications.getLastNotificationResponseAsync();
};

/**
 * Parse notification data for journey-related notifications
 */
export interface JourneyNotificationData {
    type: 'JOURNEY_REMINDER' | 'JOURNEY_READY' | 'GROUP_JOURNEY_STARTED';
    journeyId?: string;
    reminderType?: '3_DAYS' | '2_DAYS' | '1_DAY' | 'D_DAY' | 'READY';
    groupJourneyId?: string;
}

export const parseNotificationData = (
    notification: Notifications.Notification
): JourneyNotificationData | null => {
    try {
        const data = notification.request.content.data as unknown as JourneyNotificationData;
        if (data?.type) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
};

/**
 * Schedule a local notification (for testing)
 */
export const scheduleLocalNotification = async (
    title: string,
    body: string,
    seconds: number = 5,
    data?: Record<string, unknown>
): Promise<string> => {
    const id = await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data,
            sound: 'default',
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds,
        },
    });
    return id;
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllScheduledNotifications = async (): Promise<void> => {
    await Notifications.cancelAllScheduledNotificationsAsync();
};

/**
 * Get badge count
 */
export const getBadgeCount = async (): Promise<number> => {
    return await Notifications.getBadgeCountAsync();
};

/**
 * Set badge count
 */
export const setBadgeCount = async (count: number): Promise<void> => {
    await Notifications.setBadgeCountAsync(count);
};

export default {
    registerForPushNotifications,
    unregisterPushToken,
    addNotificationReceivedListener,
    addNotificationResponseListener,
    getLastNotificationResponse,
    parseNotificationData,
    scheduleLocalNotification,
    cancelAllScheduledNotifications,
    getBadgeCount,
    setBadgeCount,
};
