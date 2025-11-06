// Journey Controller
// server/controllers/journeyController.js

const prisma = require('../prisma/client');
const { calculateDistance, calculateAverageSpeed } = require('../utils/helpers');

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
    const topSpeed = Math.max(journey.topSpeed, speed || 0);
    
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
    const { latitude, longitude } = req.body;
    
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
    
    // Calculate final stats
    const routePoints = journey.routePoints || [];
    const totalDistance = calculateDistance(routePoints);
    const totalTime = Math.floor((new Date() - new Date(journey.startTime)) / 1000);
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
          _count: {
            select: { photos: true },
          },
        },
      }),
      prisma.journey.count({ where: whereClause }),
    ]);
    
    res.json({
      success: true,
      journeys,
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
};