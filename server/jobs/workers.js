// server/jobs/workers.js

const prisma = require('../prisma/client');
const { uploadToStorage, deleteFromStorage } = require('../services/Firebase');
const { cacheService } = require('../services/CacheService');
const logger = require('../services/Logger');
// Use Valkey-backed persistent job queue
const jobQueue = process.env.USE_VALKEY_QUEUE === 'true' 
  ? require('../services/ValkeyJobQueue')
  : require('../services/JobQueue');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const STALE_INSTANCE_ACTIVE_MINUTES = Number(process.env.STALE_INSTANCE_ACTIVE_MINUTES || 60);
const STALE_INSTANCE_PAUSED_HOURS = Number(process.env.STALE_INSTANCE_PAUSED_HOURS || 12);
const MIN_DISTANCE_FOR_AUTO_COMPLETE = Number(process.env.STALE_INSTANCE_MIN_DISTANCE || 200); // meters

// Use shared Prisma client

/**
 * Image processing worker
 * Processes uploaded images to create thumbnails and optimize
 */
jobQueue.process('process-image', async (job) => {
  const { photoId, userId, originalPath, originalBuffer } = job.data;
  
  try {
    logger.info(`Processing image: ${photoId}`, {
      category: 'image_processing',
      photoId,
      userId,
    });

    // Get photo record from database
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new Error(`Photo not found: ${photoId}`);
    }

    // Create different sizes
    const sizes = [
      { name: 'thumbnail', width: 150, height: 150, quality: 80 },
      { name: 'medium', width: 600, height: 600, quality: 85 },
      { name: 'large', width: 1200, height: 1200, quality: 90 },
    ];

    const processedImages = {};

    for (const size of sizes) {
      try {
        // Process image
        const processedBuffer = await sharp(originalBuffer)
          .resize(size.width, size.height, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ quality: size.quality })
          .toBuffer();

        // Generate filename
        const filename = `${size.name}_${photo.filename}`;
        const firebasePath = `users/${userId}/processed/${filename}`;

        // Upload to storage
        const imageUrl = await uploadToStorage(
          processedBuffer,
          filename,
          'image/jpeg',
          `users/${userId}/processed`
        );

        processedImages[size.name] = {
          url: imageUrl,
          path: firebasePath,
          size: processedBuffer.length,
        };

        logger.debug(`Created ${size.name} version`, {
          category: 'image_processing',
          photoId,
          size: size.name,
          fileSize: processedBuffer.length,
        });

      } catch (error) {
        logger.error(`Failed to create ${size.name} version`, {
          category: 'image_processing',
          photoId,
          size: size.name,
          error: error.message,
        });
      }
    }

    // Update photo record with processed versions
    await prisma.photo.update({
      where: { id: photoId },
      data: {
        isProcessed: true,
        deviceInfo: {
          ...photo.deviceInfo,
          processedVersions: processedImages,
          processedAt: new Date().toISOString(),
        },
      },
    });

    // Invalidate cache
    cacheService.deletePattern(`gallery:*${userId}*`);
    cacheService.deletePattern(`gallery:*${photo.journeyId}*`);

    logger.info(`Image processing completed: ${photoId}`, {
      category: 'image_processing',
      photoId,
      versionsCreated: Object.keys(processedImages).length,
    });

    return {
      photoId,
      versionsCreated: Object.keys(processedImages).length,
      processedImages,
    };

  } catch (error) {
    logger.error(`Image processing failed: ${photoId}`, {
      category: 'image_processing',
      photoId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
});

/**
 * Cache warming worker
 * Pre-populates cache with frequently accessed data
 */
jobQueue.process('warm-cache', async (job) => {
  const { type, params } = job.data;
  
  try {
    logger.info(`Warming cache: ${type}`, {
      category: 'cache_warming',
      type,
      params,
    });

    switch (type) {
      case 'global-leaderboard':
        // Warm global leaderboard cache
        await warmGlobalLeaderboard(params);
        break;
        
      case 'user-stats':
        // Warm user statistics cache
        await warmUserStats(params.userId);
        break;
        
      case 'popular-places':
        // Warm popular places cache
        await warmPopularPlaces(params);
        break;
        
      default:
        throw new Error(`Unknown cache warming type: ${type}`);
    }

    logger.info(`Cache warming completed: ${type}`, {
      category: 'cache_warming',
      type,
    });

    return { type, completed: true };

  } catch (error) {
    logger.error(`Cache warming failed: ${type}`, {
      category: 'cache_warming',
      type,
      error: error.message,
    });
    throw error;
  }
});

/**
 * Database cleanup worker
 * Cleans up old data and optimizes database
 */
jobQueue.process('database-cleanup', async (job) => {
  const { operation } = job.data;
  
  try {
    logger.info(`Database cleanup: ${operation}`, {
      category: 'database_cleanup',
      operation,
    });

    let result = {};

    switch (operation) {
      case 'old-sessions':
        result = await cleanupOldSessions();
        break;
        
      case 'incomplete-journeys':
        result = await cleanupIncompleteJourneys();
        break;
        
      case 'orphaned-photos':
        result = await cleanupOrphanedPhotos();
        break;
        
      case 'inactive-groups':
        result = await cleanupInactiveGroups();
        break;
        
      default:
        throw new Error(`Unknown cleanup operation: ${operation}`);
    }

    logger.info(`Database cleanup completed: ${operation}`, {
      category: 'database_cleanup',
      operation,
      result,
    });

    return result;

  } catch (error) {
    logger.error(`Database cleanup failed: ${operation}`, {
      category: 'database_cleanup',
      operation,
      error: error.message,
    });
    throw error;
  }
});

/**
 * Statistics calculation worker
 * Calculates and updates user statistics
 */
jobQueue.process('calculate-stats', async (job) => {
  const { userId, type } = job.data;
  
  try {
    logger.info(`Calculating stats for user: ${userId}`, {
      category: 'stats_calculation',
      userId,
      type,
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Calculate statistics from journeys
    const stats = await prisma.journey.aggregate({
      where: {
        userId,
        status: 'COMPLETED',
      },
      _sum: {
        totalDistance: true,
        totalTime: true,
      },
      _max: {
        topSpeed: true,
      },
      _count: true,
    });

    // Update user statistics
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalDistance: stats._sum.totalDistance || 0,
        totalTime: stats._sum.totalTime || 0,
        topSpeed: stats._max.topSpeed || 0,
        totalTrips: stats._count,
        updatedAt: new Date(),
      },
    });

    // Invalidate related caches
    cacheService.deletePattern(`user:*${userId}*`);
    cacheService.deletePattern(`leaderboard:*`);

    logger.info(`Stats calculation completed for user: ${userId}`, {
      category: 'stats_calculation',
      userId,
      stats: {
        totalDistance: stats._sum.totalDistance || 0,
        totalTime: stats._sum.totalTime || 0,
        topSpeed: stats._max.topSpeed || 0,
        totalTrips: stats._count,
      },
    });

    return {
      userId,
      updatedStats: {
        totalDistance: stats._sum.totalDistance || 0,
        totalTime: stats._sum.totalTime || 0,
        topSpeed: stats._max.topSpeed || 0,
        totalTrips: stats._count,
      },
    };

  } catch (error) {
    logger.error(`Stats calculation failed for user: ${userId}`, {
      category: 'stats_calculation',
      userId,
      error: error.message,
    });
    throw error;
  }
});

/**
 * Notification worker
 * Sends various notifications to users
 */
jobQueue.process('send-notification', async (job) => {
  const { userId, type, data } = job.data;
  
  try {
    logger.info(`Sending notification: ${type}`, {
      category: 'notifications',
      userId,
      type,
    });

    // This would integrate with Firebase Cloud Messaging or other notification services
    // For now, we'll just log the notification
    
    switch (type) {
      case 'group-journey-started':
        await logNotification(userId, `Group ride started: ${data.groupName}`, data);
        break;
      case 'journey-completed':
        await logNotification(userId, 'Journey completed!', data);
        break;
        
      case 'achievement-unlocked':
        await logNotification(userId, `Achievement unlocked: ${data.achievement}`, data);
        break;
        
      case 'group-invitation':
        await logNotification(userId, `You've been invited to join ${data.groupName}`, data);
        break;
        
      default:
        throw new Error(`Unknown notification type: ${type}`);
    }

    logger.info(`Notification sent: ${type}`, {
      category: 'notifications',
      userId,
      type,
    });

    return { userId, type, sent: true };

  } catch (error) {
    logger.error(`Notification failed: ${type}`, {
      category: 'notifications',
      userId,
      type,
      error: error.message,
    });
    throw error;
  }
});

// Helper functions

async function warmGlobalLeaderboard(params) {
  const { sortBy = 'totalDistance', timeFrame = 'allTime', page = 1, limit = 50 } = params;
  
  // This would call the actual leaderboard service to populate cache
  // For now, just simulate the operation
  const cacheKey = `leaderboard:global:${sortBy}:${timeFrame}:${page}:${limit}`;
  
  // Simulate data fetching
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Cache would be populated by the actual leaderboard service call
  logger.debug('Global leaderboard cache warmed', { cacheKey });
}

async function warmUserStats(userId) {
  // Warm user statistics cache
  const cacheKey = `user:stats:${userId}:allTime`;
  
  // This would call the actual user stats service
  await new Promise(resolve => setTimeout(resolve, 50));
  
  logger.debug('User stats cache warmed', { userId, cacheKey });
}

async function warmPopularPlaces(params) {
  const { latitude, longitude } = params;
  
  // Warm popular places cache for common location
  const cacheKey = `maps:nearby:${latitude}:${longitude}:point_of_interest:5000`;
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  logger.debug('Popular places cache warmed', { cacheKey });
}

async function cleanupOldSessions() {
  // Clean up old user sessions (this would be more complex with actual session storage)
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  
  // Update user last seen times
  const result = await prisma.groupMember.updateMany({
    where: {
      lastSeen: {
        lt: cutoffDate,
      },
      isLocationShared: true,
    },
    data: {
      isLocationShared: false,
    },
  });
  
  return { updatedSessions: result.count };
}

async function cleanupIncompleteJourneys() {
  // Clean up solo journeys that have been active for too long
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  
  const staleSolo = await prisma.journey.updateMany({
    where: {
      status: 'ACTIVE',
      startTime: {
        lt: cutoffDate,
      },
    },
    data: {
      status: 'CANCELLED',
      endTime: new Date(),
    },
  });

  const groupCleanup = await cleanupStuckGroupInstances();
  
  return {
    cancelledJourneys: staleSolo.count,
    ...groupCleanup,
  };
}

async function cleanupStuckGroupInstances() {
  const now = new Date();
  const activeCutoff = new Date(now.getTime() - STALE_INSTANCE_ACTIVE_MINUTES * 60 * 1000);
  const pausedCutoff = new Date(now.getTime() - STALE_INSTANCE_PAUSED_HOURS * 60 * 60 * 1000);

  let autoCompleted = 0;
  let autoCancelled = 0;
  let journeysClosed = 0;
  const touchedJourneys = new Set();

  const baseSelect = {
    id: true,
    groupJourneyId: true,
    startTime: true,
    totalDistance: true,
    totalTime: true,
    updatedAt: true,
    lastLocationUpdate: true,
  };

  const fetchStaleActive = () => prisma.journeyInstance.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { lastLocationUpdate: { lt: activeCutoff } },
        {
          lastLocationUpdate: null,
          updatedAt: { lt: activeCutoff },
        },
      ],
    },
    select: baseSelect,
    orderBy: { updatedAt: 'asc' },
    take: 25,
  });

  let batch = await fetchStaleActive();
  while (batch.length) {
    for (const instance of batch) {
      const startTime = instance.startTime ? new Date(instance.startTime) : now;
      const derivedTotalTime = instance.totalTime && instance.totalTime > 0
        ? instance.totalTime
        : Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
      const shouldComplete = (instance.totalDistance || 0) >= MIN_DISTANCE_FOR_AUTO_COMPLETE;
      const finalStatus = shouldComplete ? 'COMPLETED' : 'CANCELLED';

      await prisma.journeyInstance.update({
        where: { id: instance.id },
        data: {
          status: finalStatus,
          endTime: now,
          totalTime: derivedTotalTime,
        },
      });

      touchedJourneys.add(instance.groupJourneyId);
      if (finalStatus === 'COMPLETED') {
        autoCompleted += 1;
      } else {
        autoCancelled += 1;
      }
    }

    batch = await fetchStaleActive();
  }

  const fetchStalePaused = () => prisma.journeyInstance.findMany({
    where: {
      status: 'PAUSED',
      updatedAt: { lt: pausedCutoff },
    },
    select: {
      id: true,
      groupJourneyId: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 25,
  });

  batch = await fetchStalePaused();
  while (batch.length) {
    for (const instance of batch) {
      await prisma.journeyInstance.update({
        where: { id: instance.id },
        data: {
          status: 'CANCELLED',
          endTime: now,
        },
      });
      touchedJourneys.add(instance.groupJourneyId);
      autoCancelled += 1;
    }

    batch = await fetchStalePaused();
  }

  for (const groupJourneyId of touchedJourneys) {
    if (!groupJourneyId) continue;
    const closed = await finalizeGroupJourneyIfFinished(groupJourneyId, now);
    if (closed) {
      journeysClosed += 1;
    }
  }

  if (autoCompleted || autoCancelled) {
    logger.info('[Cleanup] Auto-resolved stuck group instances', {
      category: 'database_cleanup',
      autoCompleted,
      autoCancelled,
      journeysClosed,
    });
  }

  return {
    autoCompletedInstances: autoCompleted,
    autoCancelledInstances: autoCancelled,
    groupJourneysClosed: journeysClosed,
  };
}

async function finalizeGroupJourneyIfFinished(groupJourneyId, timestamp = new Date()) {
  const remaining = await prisma.journeyInstance.count({
    where: {
      groupJourneyId,
      status: {
        in: ['ACTIVE', 'PAUSED'],
      },
    },
  });

  if (remaining > 0) {
    return false;
  }

  const journey = await prisma.groupJourney.findUnique({
    where: { id: groupJourneyId },
    select: { status: true },
  });

  if (!journey || journey.status !== 'ACTIVE') {
    return false;
  }

  await prisma.groupJourney.update({
    where: { id: groupJourneyId },
    data: {
      status: 'COMPLETED',
      completedAt: timestamp,
    },
  });

  logger.info('[Cleanup] Auto-completed group journey', {
    category: 'database_cleanup',
    groupJourneyId,
  });

  return true;
}

async function cleanupOrphanedPhotos() {
  // Find photos without associated journeys or users
  const orphanedPhotos = await prisma.photo.findMany({
    where: {
      AND: [
        {
          OR: [
            { journeyId: null },
            { journey: null },
          ],
        },
        {
          createdAt: {
            lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days old
          },
        },
      ],
    },
  });
  
  // Delete orphaned photos
  for (const photo of orphanedPhotos) {
    try {
      // Delete from storage
      await deleteFromStorage(photo.firebasePath);
      if (photo.thumbnailPath) {
        await deleteFromStorage(photo.thumbnailPath);
      }
      
      // Delete from database
      await prisma.photo.delete({
        where: { id: photo.id },
      });
    } catch (error) {
      logger.warn(`Failed to delete orphaned photo: ${photo.id}`, {
        error: error.message,
      });
    }
  }
  
  return { deletedPhotos: orphanedPhotos.length };
}

async function cleanupInactiveGroups() {
  // Deactivate groups with no recent activity
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
  
  const inactiveGroups = await prisma.group.findMany({
    where: {
      isActive: true,
      updatedAt: {
        lt: cutoffDate,
      },
      journeys: {
        none: {
          startTime: {
            gte: cutoffDate,
          },
        },
      },
    },
  });
  
  // Deactivate inactive groups
  const result = await prisma.group.updateMany({
    where: {
      id: {
        in: inactiveGroups.map(g => g.id),
      },
    },
    data: {
      isActive: false,
    },
  });
  
  return { deactivatedGroups: result.count };
}

async function logNotification(userId, message, data) {
  // Log notification (in a real app, this would send to FCM or other service)
  logger.info(`Notification: ${message}`, {
    category: 'notification_log',
    userId,
    message,
    data,
  });
  
  // Could store in database for notification history
  // await prisma.notification.create({ ... });
}

// Initialize job queue with cleanup
jobQueue.startCleanup();

// Schedule periodic jobs
const schedulePeriodicJobs = () => {
  // Schedule database cleanup jobs
  setInterval(() => {
    jobQueue.add('database-cleanup', { operation: 'old-sessions' }, { priority: 1 });
    jobQueue.add('database-cleanup', { operation: 'incomplete-journeys' }, { priority: 2 });
    jobQueue.add('database-cleanup', { operation: 'orphaned-photos' }, { priority: 1 });
  }, 6 * 60 * 60 * 1000); // Every 6 hours
  
  // Schedule cache warming
  setInterval(() => {
    jobQueue.add('warm-cache', { 
      type: 'global-leaderboard', 
      params: { sortBy: 'totalDistance' } 
    }, { priority: 3 });
  }, 30 * 60 * 1000); // Every 30 minutes
  
  logger.info('Periodic jobs scheduled', {
    category: 'job_scheduling',
  });
};

module.exports = {
  jobQueue,
  schedulePeriodicJobs,
};