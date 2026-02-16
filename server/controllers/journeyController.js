// Journey Controller
// server/controllers/journeyController.js

const prisma = require('../prisma/client');
const { calculateDistance, calculateDistanceFiltered, calculateAverageSpeed, validateDistance } = require('../utils/helpers');
const { hydratePhotos, getCoverPhotoUrl } = require('../utils/photoFormatter');

/**
 * Create a new journey (Active or Planned)
 */
const createJourney = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      title,
      vehicle,
      groupId,
      status: rawStatus = 'ACTIVE',
      startTime,
      endLatitude,
      endLongitude,
      notes,
    } = req.body;

    const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : 'ACTIVE';
    const requiresCoordinates = normalizedStatus === 'ACTIVE';
    const hasCoordinates =
      latitude !== undefined &&
      latitude !== null &&
      latitude !== '' &&
      longitude !== undefined &&
      longitude !== null &&
      longitude !== '';

    if (requiresCoordinates && !hasCoordinates) {
      return res.status(400).json({
        error: 'Missing coordinates',
        message: 'Latitude and longitude are required when starting an active journey',
      });
    }

    const resolvedLatitude = hasCoordinates ? Number(latitude) : null;
    const resolvedLongitude = hasCoordinates ? Number(longitude) : null;
    const resolvedEndLatitude =
      endLatitude !== undefined && endLatitude !== null && endLatitude !== ''
        ? Number(endLatitude)
        : null;
    const resolvedEndLongitude =
      endLongitude !== undefined && endLongitude !== null && endLongitude !== ''
        ? Number(endLongitude)
        : null;

    const userId = req.user.id;

    if (normalizedStatus === 'ACTIVE') {
      const activeJourney = await prisma.journey.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });

      if (activeJourney) {
        return res.status(400).json({
          error: 'Active journey exists',
          message: 'Please end current journey before starting a new one',
          activeJourney,
        });
      }
    }

    const journey = await prisma.journey.create({
      data: {
        userId,
        title: title || 'My Journey',
        startTime: startTime ? new Date(startTime) : new Date(),
        startLatitude: resolvedLatitude,
        startLongitude: resolvedLongitude,
        endLatitude: resolvedEndLatitude,
        endLongitude: resolvedEndLongitude,
        vehicle: vehicle || 'car',
        groupId,
        status: normalizedStatus,
        customTitle: null,
        isHidden: false,
        routePoints:
          normalizedStatus === 'ACTIVE'
            ? [
              {
                lat: resolvedLatitude,
                lng: resolvedLongitude,
                timestamp: new Date().toISOString(),
                speed: 0,
              },
            ]
            : [],
        weatherData: notes ? { notes } : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: normalizedStatus === 'PLANNED' ? 'Journey saved for later' : 'Journey started successfully',
      journey,
    });
  } catch (error) {
    console.error('Create journey error:', error);
    res.status(500).json({
      error: 'Failed to create journey',
      message: error.message,
    });
  }
};

/**
 * Start a new journey
 */
const startJourney = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      title,
      vehicle,
      groupId
    } = req.body;

    const userId = req.user.id;

    // Check if user has an active journey
    const activeJourney = await prisma.journey.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    if (activeJourney) {
      return res.status(400).json({
        error: 'Active journey exists',
        message: 'Please end current journey before starting a new one',
        activeJourney,
      });
    }

    // Create new journey
    const journey = await prisma.journey.create({
      data: {
        userId,
        title: title || 'My Journey',
        startTime: new Date(),
        startLatitude: latitude,
        startLongitude: longitude,
        vehicle: vehicle || 'car',
        groupId,
        routePoints: [{
          lat: latitude,
          lng: longitude,
          timestamp: new Date().toISOString(),
          speed: 0
        }],
        customTitle: null,
        isHidden: false,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Journey started successfully',
      journey,
    });

  } catch (error) {
    console.error('Start journey error:', error);
    res.status(500).json({
      error: 'Failed to start journey',
      message: error.message,
    });
  }
};

/**
 * Update journey progress (GPS tracking)
 */
const updateJourneyProgress = async (req, res) => {
  try {
    const { journeyId } = req.params;
    const { latitude, longitude, speed, timestamp } = req.body;

    const userId = req.user.id;

    // Get current journey
    const journey = await prisma.journey.findFirst({
      where: {
        id: journeyId,
        userId,
        status: 'ACTIVE',
      },
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
        message: 'Active journey not found for this user',
      });
    }

    // Update route points
    const currentRoutePoints = journey.routePoints || [];
    const newRoutePoint = {
      lat: latitude,
      lng: longitude,
      timestamp: timestamp || new Date().toISOString(),
      speed: speed || 0,
    };

    const updatedRoutePoints = [...currentRoutePoints, newRoutePoint];

    // Calculate updated stats
    const totalDistance = calculateDistance(updatedRoutePoints);
    const totalTime = Math.floor((new Date() - new Date(journey.startTime)) / 1000);
    const avgSpeed = calculateAverageSpeed(totalDistance, totalTime);

    // Validate speed before updating topSpeed - cap at 250 km/h to prevent GPS drift issues
    const MAX_REASONABLE_SPEED_KMH = 250;
    const validatedSpeed = Math.min(Math.max(speed || 0, 0), MAX_REASONABLE_SPEED_KMH);
    const topSpeed = Math.max(journey.topSpeed, validatedSpeed);

    // Update journey
    const updatedJourney = await prisma.journey.update({
      where: { id: journeyId },
      data: {
        routePoints: updatedRoutePoints,
        totalDistance,
        totalTime,
        avgSpeed,
        topSpeed,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Journey updated successfully',
      journey: updatedJourney,
      stats: {
        totalDistance,
        totalTime,
        avgSpeed,
        topSpeed,
      },
    });

  } catch (error) {
    console.error('Update journey error:', error);
    res.status(500).json({
      error: 'Failed to update journey',
      message: error.message,
    });
  }
};

/**
 * End/Complete journey
 */
const endJourney = async (req, res) => {
  try {
    const { journeyId } = req.params;
    const { latitude, longitude, totalDistance: clientTotalDistance, totalTime: clientTotalTime } = req.body;

    const userId = req.user.id;

    // Get current journey (also accept COMPLETED for idempotent retries)
    const journey = await prisma.journey.findFirst({
      where: {
        id: journeyId,
        userId,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
        message: 'Active journey not found for this user',
      });
    }

    // Idempotent: if already completed, return success without re-processing
    if (journey.status === 'COMPLETED') {
      return res.json({
        success: true,
        message: 'Journey already completed',
        journey,
      });
    }

    // CRITICAL: Use client-provided totalDistance if available (from Roads API snapped data)
    // This ensures accurate final distance without phantom data
    // Otherwise fall back to calculating from routePoints
    const routePoints = journey.routePoints || [];
    const calculatedDistance = calculateDistanceFiltered(routePoints);

    // Calculate time from journey startTime as fallback
    const calculatedTime = Math.floor((new Date() - new Date(journey.startTime)) / 1000);

    // Prefer client-provided totalTime (from persistent startTime) if available and reasonable
    // Validate: client time should be within 10% of calculated time, or use calculated
    let totalTime;
    if (clientTotalTime !== undefined && clientTotalTime !== null && clientTotalTime > 0) {
      const timeDiff = Math.abs(clientTotalTime - calculatedTime);
      const timeDiffPercent = calculatedTime > 0 ? timeDiff / calculatedTime : 0;

      if (timeDiffPercent <= 0.1 || timeDiff <= 60) {
        // Within 10% or 1 minute - use client time
        totalTime = clientTotalTime;
        console.log(`[Journey ${journeyId}] Using client time: ${totalTime}s (server: ${calculatedTime}s)`);
      } else {
        // Significant difference - log and use average
        console.warn(`[Journey ${journeyId}] Time mismatch: client=${clientTotalTime}s, server=${calculatedTime}s (${(timeDiffPercent * 100).toFixed(1)}% diff)`);
        totalTime = Math.floor((clientTotalTime + calculatedTime) / 2);
      }
    } else {
      totalTime = calculatedTime;
    }

    // Validate client distance against calculated and time constraints
    const { distance: totalDistance, source: distanceSource, warning } = validateDistance(
      clientTotalDistance,
      calculatedDistance,
      totalTime
    );

    if (warning) {
      console.warn(`[Journey ${journeyId}] ${warning}`);
    }

    console.log(`[Journey ${journeyId}] Final distance: ${totalDistance.toFixed(2)}km (source: ${distanceSource}, calculated: ${calculatedDistance.toFixed(2)}km)`);

    const avgSpeed = calculateAverageSpeed(totalDistance, totalTime);

    // End journey
    const completedJourney = await prisma.journey.update({
      where: { id: journeyId },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
        endLatitude: latitude,
        endLongitude: longitude,
        totalDistance,
        totalTime,
        avgSpeed,
      },
    });

    // Update user total stats
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalDistance: {
          increment: totalDistance,
        },
        totalTime: {
          increment: totalTime,
        },
        topSpeed: {
          set: Math.max(req.user.topSpeed, journey.topSpeed),
        },
        totalTrips: {
          increment: 1,
        },
      },
    });

    // Check achievements and update streak (fire-and-forget)
    try {
      const achievementService = require('../services/achievementService');
      const newAchievements = await achievementService.checkAndAwardAchievements(userId, {
        completedAt: new Date(),
      });
      await achievementService.updateStreak(userId);
      if (newAchievements.length > 0) {
        console.log(`[Journey] ${userId} unlocked ${newAchievements.length} achievement(s)`);
      }
    } catch (achError) {
      console.warn('[Journey] Achievement check failed (non-blocking):', achError.message);
    }

    res.json({
      success: true,
      message: 'Journey completed successfully',
      journey: completedJourney,
    });

  } catch (error) {
    console.error('End journey error:', error);
    res.status(500).json({
      error: 'Failed to end journey',
      message: error.message,
    });
  }
};

/**
 * Get user's journey history
 */
const getJourneyHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    const skip = (page - 1) * limit;

    const whereClause = {
      userId,
      ...(status && { status }),
    };

    const [journeys, total] = await Promise.all([
      prisma.journey.findMany({
        where: whereClause,
        orderBy: { startTime: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          group: {
            select: { id: true, name: true },
          },
          photos: {
            select: {
              id: true,
              filename: true,
              firebasePath: true,
              thumbnailPath: true,
              latitude: true,
              longitude: true,
              takenAt: true,
            },
            orderBy: { takenAt: 'asc' },
            take: 10, // Include up to 10 photos for preview
          },
        },
      }),
      prisma.journey.count({ where: whereClause }),
    ]);

    const formattedJourneys = journeys.map((journey) => {
      const hydratedPhotos = hydratePhotos(journey.photos);
      return {
        ...journey,
        photos: hydratedPhotos,
        coverPhotoUrl: getCoverPhotoUrl(hydratedPhotos),
      };
    });

    res.json({
      success: true,
      journeys: formattedJourneys,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Get journey history error:', error);
    res.status(500).json({
      error: 'Failed to get journey history',
      message: error.message,
    });
  }
};

/**
 * Get current active journey
 */
const getActiveJourney = async (req, res) => {
  try {
    const userId = req.user.id;

    const journey = await prisma.journey.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        group: {
          select: { id: true, name: true },
        },
        photos: {
          select: { id: true, filename: true, firebasePath: true },
          orderBy: { takenAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!journey) {
      return res.status(404).json({
        error: 'No active journey',
        message: 'No active journey found for this user',
      });
    }

    res.json({
      success: true,
      journey,
    });

  } catch (error) {
    console.error('Get active journey error:', error);
    res.status(500).json({
      error: 'Failed to get active journey',
      message: error.message,
    });
  }
};

module.exports = {
  createJourney,
  startJourney,
  updateJourneyProgress,
  endJourney,
  getJourneyHistory,
  getActiveJourney,
  pauseJourney: async (req, res) => {
    try {
      const { journeyId } = req.params;
      const userId = req.user.id;

      const journey = await prisma.journey.findFirst({
        where: { id: journeyId, userId, status: 'ACTIVE' },
      });

      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Active journey not found for this user',
        });
      }

      const updated = await prisma.journey.update({
        where: { id: journeyId },
        data: { status: 'PAUSED', updatedAt: new Date() },
      });

      res.json({ success: true, message: 'Journey paused', journey: updated });
    } catch (error) {
      console.error('Pause journey error:', error);
      res.status(500).json({ error: 'Failed to pause journey', message: error.message });
    }
  },
  resumeJourney: async (req, res) => {
    try {
      const { journeyId } = req.params;
      const userId = req.user.id;

      const journey = await prisma.journey.findFirst({
        where: { id: journeyId, userId, status: 'PAUSED' },
      });

      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Paused journey not found for this user',
        });
      }

      const updated = await prisma.journey.update({
        where: { id: journeyId },
        data: { status: 'ACTIVE', updatedAt: new Date() },
      });

      res.json({ success: true, message: 'Journey resumed', journey: updated });
    } catch (error) {
      console.error('Resume journey error:', error);
      res.status(500).json({ error: 'Failed to resume journey', message: error.message });
    }
  },

  /**
   * Force clear/cancel a stuck journey (any status)
   */
  forceClearJourney: async (req, res) => {
    const { deleteFromCloudinary, cloudinaryInitialized } = require('../services/CloudinaryService');

    try {
      const { journeyId } = req.params;
      const userId = req.user.id;

      // Find journey regardless of status, including photos
      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
        },
        include: {
          photos: {
            select: { firebasePath: true, thumbnailPath: true },
          },
        },
      });

      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Journey not found for this user',
        });
      }

      // Delete Cloudinary images before deleting journey to prevent orphans
      if (cloudinaryInitialized && journey.photos && journey.photos.length > 0) {
        console.log(`[ForceClear] Deleting ${journey.photos.length} photos from Cloudinary for journey ${journeyId}`);
        for (const photo of journey.photos) {
          try {
            if (photo.firebasePath && photo.firebasePath.includes('cloudinary.com')) {
              await deleteFromCloudinary(photo.firebasePath);
            }
            if (photo.thumbnailPath && photo.thumbnailPath.includes('cloudinary.com')) {
              await deleteFromCloudinary(photo.thumbnailPath);
            }
          } catch (err) {
            console.error(`[ForceClear] Failed to delete Cloudinary image:`, err.message);
            // Continue with deletion even if Cloudinary cleanup fails
          }
        }
      }

      // Delete the journey completely (cascade will handle related records)
      await prisma.journey.delete({
        where: { id: journeyId },
      });

      console.log(`Force cleared stuck journey ${journeyId} for user ${userId}`);

      res.json({
        success: true,
        message: 'Journey force-cleared successfully'
      });
    } catch (error) {
      console.error('Force clear journey error:', error);
      res.status(500).json({
        error: 'Failed to force clear journey',
        message: error.message
      });
    }
  },

  /**
   * Update journey-level preferences such as custom title or hidden state
   */
  updateJourneyPreferences: async (req, res) => {
    try {
      const { journeyId } = req.params;
      const { customTitle, isHidden } = req.body;
      const userId = req.user.id;

      const journey = await prisma.journey.findFirst({
        where: { id: journeyId, userId },
      });

      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Journey not found for this user',
        });
      }

      const data = {};

      if (customTitle !== undefined) {
        const trimmed = typeof customTitle === 'string' ? customTitle.trim() : '';
        data.customTitle = trimmed.length ? trimmed : null;
      }

      if (isHidden !== undefined) {
        const hiddenFlag = Boolean(isHidden);
        data.isHidden = hiddenFlag;
        data.hiddenAt = hiddenFlag ? new Date() : null;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({
          error: 'No changes provided',
          message: 'Nothing to update for this journey',
        });
      }

      const updatedJourney = await prisma.journey.update({
        where: { id: journeyId },
        data,
        select: {
          id: true,
          title: true,
          customTitle: true,
          isHidden: true,
          hiddenAt: true,
        },
      });

      res.json({
        success: true,
        message: 'Journey preferences updated',
        journey: updatedJourney,
      });
    } catch (error) {
      console.error('Update journey preferences error:', error);
      res.status(500).json({
        error: 'Failed to update journey preferences',
        message: error.message,
      });
    }
  },

  /**
   * Restore all hidden journeys for the authenticated user
   */
  restoreHiddenJourneys: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await prisma.journey.updateMany({
        where: { userId, isHidden: true },
        data: { isHidden: false, hiddenAt: null },
      });

      res.json({
        success: true,
        restored: result.count,
        message: result.count ? 'Hidden journeys restored' : 'No hidden journeys to restore',
      });
    } catch (error) {
      console.error('Restore hidden journeys error:', error);
      res.status(500).json({
        error: 'Failed to restore hidden journeys',
        message: error.message,
      });
    }
  },

  /**
   * Clear all custom titles for the authenticated user
   */
  clearCustomJourneyTitles: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await prisma.journey.updateMany({
        where: { userId, NOT: { customTitle: null } },
        data: { customTitle: null },
      });

      res.json({
        success: true,
        cleared: result.count,
        message: result.count ? 'Custom names cleared' : 'No custom journey names to clear',
      });
    } catch (error) {
      console.error('Clear custom journey titles error:', error);
      res.status(500).json({
        error: 'Failed to clear custom journey names',
        message: error.message,
      });
    }
  },
};
