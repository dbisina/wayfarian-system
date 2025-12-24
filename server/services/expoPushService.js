// server/services/expoPushService.js
// Service for sending push notifications via Expo's push API

const logger = require('../utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a single device
 * @param {string} expoPushToken - Expo push token (format: ExponentPushToken[xxx])
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  // Validate token format
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    logger.warn('[ExpoPush] Invalid push token format:', expoPushToken);
    return { success: false, error: 'Invalid push token format' };
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'journey-reminders', // Android notification channel
  };

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data && result.data[0]?.status === 'ok') {
      logger.info('[ExpoPush] Notification sent successfully', { title, token: expoPushToken.substring(0, 20) + '...' });
      return { success: true };
    }

    if (result.data && result.data[0]?.status === 'error') {
      const error = result.data[0];
      logger.error('[ExpoPush] Notification failed:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }

    return { success: true };
  } catch (error) {
    logger.error('[ExpoPush] Failed to send notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notifications to multiple devices
 * @param {Array<{token: string, title: string, body: string, data?: object}>} notifications
 * @returns {Promise<{sent: number, failed: number}>}
 */
const sendBatchNotifications = async (notifications) => {
  const messages = notifications
    .filter(n => n.token && n.token.startsWith('ExponentPushToken'))
    .map(n => ({
      to: n.token,
      sound: 'default',
      title: n.title,
      body: n.body,
      data: n.data || {},
      priority: 'high',
      channelId: 'journey-reminders',
    }));

  if (messages.length === 0) {
    return { sent: 0, failed: notifications.length };
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    
    let sent = 0;
    let failed = 0;
    
    if (result.data && Array.isArray(result.data)) {
      result.data.forEach(r => {
        if (r.status === 'ok') sent++;
        else failed++;
      });
    }

    logger.info(`[ExpoPush] Batch complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  } catch (error) {
    logger.error('[ExpoPush] Batch send failed:', error);
    return { sent: 0, failed: messages.length };
  }
};

/**
 * Create notification messages for journey reminders
 */
const createReminderMessage = (journeyTitle, reminderType, startTime) => {
  const formattedDate = new Date(startTime).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const messages = {
    '3_DAYS': {
      title: '🗓️ Journey in 3 Days',
      body: `Get ready! "${journeyTitle}" starts on ${formattedDate}`,
    },
    '2_DAYS': {
      title: '🚗 Journey in 2 Days',
      body: `"${journeyTitle}" is coming up on ${formattedDate}`,
    },
    '1_DAY': {
      title: '⏰ Journey Tomorrow!',
      body: `"${journeyTitle}" starts tomorrow at ${new Date(startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    },
    'D_DAY': {
      title: '🚀 Journey Today!',
      body: `"${journeyTitle}" starts at ${new Date(startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    },
    'READY': {
      title: '🏁 Time to Start!',
      body: `"${journeyTitle}" is ready to begin. Tap to start your journey!`,
    },
  };

  return messages[reminderType] || { title: 'Journey Reminder', body: `"${journeyTitle}" is coming up` };
};

module.exports = {
  sendPushNotification,
  sendBatchNotifications,
  createReminderMessage,
};
