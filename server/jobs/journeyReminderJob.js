// server/jobs/journeyReminderJob.js
// Cron job for sending scheduled journey reminders

const cron = require('node-cron');
const prisma = require('../prisma/client');
const logger = require('../utils/logger');
const { sendPushNotification, createReminderMessage } = require('../services/expoPushService');

// Reminder windows in hours before journey start
const REMINDER_WINDOWS = {
  '3_DAYS': { minHours: 71, maxHours: 73 },  // 3 days = 72 hours
  '2_DAYS': { minHours: 47, maxHours: 49 },  // 2 days = 48 hours
  '1_DAY': { minHours: 23, maxHours: 25 },   // 1 day = 24 hours
  'D_DAY': { minHours: -1, maxHours: 1 },    // Within 1 hour of start time
};

/**
 * Calculate hours until journey start
 */
const hoursUntilStart = (startTime) => {
  const now = new Date();
  const start = new Date(startTime);
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
};

/**
 * Determine which reminder types should be sent for a journey
 */
const getReminderTypesToSend = (hoursRemaining, existingReminders) => {
  const typesToSend = [];
  const existingTypes = new Set(existingReminders.map(r => r.type));

  for (const [type, window] of Object.entries(REMINDER_WINDOWS)) {
    if (!existingTypes.has(type) && hoursRemaining >= window.minHours && hoursRemaining <= window.maxHours) {
      typesToSend.push(type);
    }
  }

  return typesToSend;
};

/**
 * Check if journey should be marked as READY_TO_START
 */
const shouldMarkReady = (startTime) => {
  const hours = hoursUntilStart(startTime);
  return hours <= 0; // Time has arrived or passed
};

/**
 * Process a single planned journey for reminders
 */
const processJourney = async (journey) => {
  const hours = hoursUntilStart(journey.startTime);
  
  // Skip if journey is more than 4 days away
  if (hours > 96) return;

  // Get user's push token
  const user = await prisma.user.findUnique({
    where: { id: journey.userId },
    select: { expoPushToken: true },
  });

  // Get existing reminders for this journey
  const existingReminders = await prisma.journeyReminder.findMany({
    where: { journeyId: journey.id },
    select: { type: true },
  });

  // Check what reminders need to be sent
  const typesToSend = getReminderTypesToSend(hours, existingReminders);

  // Send reminders if user has push token
  if (user?.expoPushToken && typesToSend.length > 0) {
    for (const type of typesToSend) {
      const { title, body } = createReminderMessage(
        journey.title || 'Your Journey',
        type,
        journey.startTime
      );

      const result = await sendPushNotification(
        user.expoPushToken,
        title,
        body,
        {
          type: 'JOURNEY_REMINDER',
          journeyId: journey.id,
          reminderType: type,
        }
      );

      if (result.success) {
        // Record that we sent this reminder
        await prisma.journeyReminder.create({
          data: {
            journeyId: journey.id,
            userId: journey.userId,
            type,
          },
        });
        logger.info(`[ReminderJob] Sent ${type} reminder for journey ${journey.id}`);
      }
    }
  }

  // Check if journey should be marked as READY_TO_START
  if (shouldMarkReady(journey.startTime) && journey.status === 'PLANNED') {
    await prisma.journey.update({
      where: { id: journey.id },
      data: { status: 'READY_TO_START' },
    });

    // Send READY notification if not already sent
    const readyReminderExists = existingReminders.some(r => r.type === 'READY');
    if (!readyReminderExists && user?.expoPushToken) {
      const { title, body } = createReminderMessage(
        journey.title || 'Your Journey',
        'READY',
        journey.startTime
      );

      await sendPushNotification(user.expoPushToken, title, body, {
        type: 'JOURNEY_READY',
        journeyId: journey.id,
      });

      await prisma.journeyReminder.create({
        data: {
          journeyId: journey.id,
          userId: journey.userId,
          type: 'READY',
        },
      });

      logger.info(`[ReminderJob] Journey ${journey.id} marked as READY_TO_START`);
    }
  }
};

/**
 * Main job function - runs periodically to check for journey reminders
 */
const runReminderJob = async () => {
  logger.info('[ReminderJob] Starting journey reminder check...');

  try {
    // Find all PLANNED and READY_TO_START journeys with future or recent start times
    const journeys = await prisma.journey.findMany({
      where: {
        status: { in: ['PLANNED', 'READY_TO_START'] },
        startTime: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Not more than 24h in the past
          lte: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // Within 4 days
        },
      },
      select: {
        id: true,
        userId: true,
        title: true,
        startTime: true,
        status: true,
      },
    });

    logger.info(`[ReminderJob] Found ${journeys.length} planned journeys to check`);

    for (const journey of journeys) {
      try {
        await processJourney(journey);
      } catch (error) {
        logger.error(`[ReminderJob] Error processing journey ${journey.id}:`, error);
      }
    }

    logger.info('[ReminderJob] Reminder check complete');
  } catch (error) {
    logger.error('[ReminderJob] Job failed:', error);
  }
};

/**
 * Start the cron job
 * Runs every hour at minute 0
 */
const startReminderJob = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', () => {
    runReminderJob();
  });

  logger.info('[ReminderJob] Journey reminder job started (runs every hour)');

  // Run immediately on startup to catch any missed reminders
  setTimeout(() => {
    runReminderJob();
  }, 5000); // 5 second delay to ensure DB connection is ready
};

/**
 * Stop the cron job (for testing)
 */
let cronTask = null;
const stopReminderJob = () => {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
};

module.exports = {
  startReminderJob,
  stopReminderJob,
  runReminderJob, // Export for manual testing
  processJourney, // Export for unit testing
};
