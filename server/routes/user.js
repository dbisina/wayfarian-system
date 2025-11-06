// User Routes
// server/routes/user.js

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const prisma = require('../prisma/client');
const {
  upload,
  getUserProfile,
  updateUserProfile,
  uploadProfilePicture,
  getUserStats,
  getJourneyHistory,
  exportUserData,
} = require('../controllers/userController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * @route GET /api/user/profile
 * @desc Get user profile with extended information
 * @access Private
 */
router.get('/profile', getUserProfile);

/**
 * @route PUT /api/user/profile
 * @desc Update user profile information
 * @access Private
 */
router.put(
  '/profile',
  [
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name must be between 1 and 50 characters'),
    body('phoneNumber')
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number format'),
  ],
  handleValidationErrors,
  updateUserProfile
);

/**
 * @route POST /api/user/profile-picture
 * @desc Upload profile picture
 * @access Private
 */
router.post('/profile-picture', upload, uploadProfilePicture);

/**
 * @route GET /api/user/stats
 * @desc Get user statistics with optional timeframe filter
 * @access Private
 */
router.get(
  '/stats',
  [
    query('timeframe')
      .optional()
      .isIn(['allTime', 'week', 'month', 'year'])
      .withMessage('Invalid timeframe. Must be allTime, week, month, or year'),
  ],
  handleValidationErrors,
  getUserStats
);

/**
 * @route GET /api/user/journey-history
 * @desc Get user's journey history with filters and pagination
 * @access Private
 */
router.get(
  '/journey-history',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'])
      .withMessage('Invalid status'),
    query('vehicle')
      .optional()
      .isIn(['bike', 'car', 'truck', 'motorcycle', 'bus', 'other'])
      .withMessage('Invalid vehicle type'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format'),
    query('sortBy')
      .optional()
      .isIn(['startTime', 'endTime', 'totalDistance', 'totalTime', 'topSpeed'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
  ],
  handleValidationErrors,
  getJourneyHistory
);

/**
 * @route GET /api/user/export-data
 * @desc Export all user data (GDPR compliance)
 * @access Private
 */
router.get('/export-data', exportUserData);

/**
 * @route GET /api/user/dashboard
 * @desc Get dashboard summary data
 * @access Private
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    // Run queries sequentially to work with PgBouncer (connection_limit=1)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        displayName: true,
        photoURL: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
        xp: true,
        level: true,
      },
    });

    const activeJourney = await prisma.journey.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        startTime: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
      },
    });

    const recentJourneys = await prisma.journey.findMany({
      where: { userId, status: 'COMPLETED' },
      orderBy: { endTime: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        totalDistance: true,
        totalTime: true,
      },
    });

    const activeGroupsRaw = await prisma.groupMember.findMany({
      where: { userId, group: { isActive: true } },
      take: 3,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
          },
        },
      },
    });
    const activeGroups = activeGroupsRaw.map((ag) => ag.group);

    const recentPhotos = await prisma.photo.findMany({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      take: 6,
      select: {
        id: true,
        filename: true,
        firebasePath: true,
        takenAt: true,
        journey: { select: { id: true, title: true } },
      },
    });

    const weeklyStats = await prisma.journey.aggregate({
      where: {
        userId,
        status: 'COMPLETED',
        startTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _sum: { totalDistance: true, totalTime: true },
      _count: true,
    });

    res.json({
      success: true,
      dashboard: {
        user,
        activeJourney,
        recentJourneys,
        activeGroups,
        recentPhotos,
        weeklyStats: {
          journeys: weeklyStats._count,
          distance: weeklyStats._sum.totalDistance || 0,
          time: weeklyStats._sum.totalTime || 0,
        },
      },
    });
  } catch (error) {
    if (error?.code === 'P2024' || /connection pool timeout/i.test(error?.message || '')) {
      return res.status(503).json({ error: 'Service Unavailable', message: 'Database busy, please retry shortly' });
    }
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data', message: error.message });
  }
});

/**
 * @route GET /api/user/achievements
 * @desc Get user achievements and progress
 * @access Private
 */
router.get('/achievements', async (req, res) => {
  try {
    const userId = req.user.id;
    const { getAchievementXP, getLevelProgress } = require('../constants/xpSystem');
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
        createdAt: true,
        xp: true,
        level: true,
      },
    });
    
    // Define achievements with multiple tiers and XP rewards
    const achievements = [
      {
        id: 'first_journey',
        name: 'First Journey',
        description: 'Complete your first journey',
        category: 'milestone',
        xp: getAchievementXP('first_journey'),
        tiers: [
          { level: 1, threshold: 1, unlocked: user.totalTrips >= 1 }
        ],
        current: user.totalTrips,
        icon: '🚀',
        badge: true,
      },
      {
        id: 'hundred_km',
        name: '100 KM Explorer',
        description: 'Travel 100 kilometers',
        category: 'distance',
        xp: getAchievementXP('hundred_km'),
        tiers: [
          { level: 1, threshold: 100, name: '100 KM Explorer', unlocked: user.totalDistance >= 100 },
        ],
        current: user.totalDistance,
        icon: '🌍',
        badge: true,
      },
      {
        id: 'five_hundred_km',
        name: '500 KM Adventurer',
        description: 'Travel 500 kilometers',
        category: 'distance',
        xp: getAchievementXP('five_hundred_km'),
        tiers: [
          { level: 1, threshold: 500, name: '500 KM Adventurer', unlocked: user.totalDistance >= 500 },
        ],
        current: user.totalDistance,
        icon: '🌍',
        badge: true,
      },
      {
        id: 'thousand_km',
        name: '1000 KM Voyager',
        description: 'Travel 1000 kilometers',
        category: 'distance',
        xp: getAchievementXP('thousand_km'),
        tiers: [
          { level: 1, threshold: 1000, name: '1000 KM Voyager', unlocked: user.totalDistance >= 1000 },
        ],
        current: user.totalDistance,
        icon: '🌍',
        badge: true,
      },
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Reach 100 km/h',
        category: 'speed',
        xp: getAchievementXP('speed_demon'),
        tiers: [
          { level: 1, threshold: 100, name: 'Speed Demon', unlocked: user.topSpeed >= 100 },
        ],
        current: user.topSpeed,
        icon: '⚡',
        badge: true,
      },
      {
        id: 'velocity_master',
        name: 'Velocity Master',
        description: 'Reach 150 km/h',
        category: 'speed',
        xp: getAchievementXP('velocity_master'),
        tiers: [
          { level: 1, threshold: 150, name: 'Velocity Master', unlocked: user.topSpeed >= 150 },
        ],
        current: user.topSpeed,
        icon: '⚡',
        badge: true,
      },
      {
        id: 'ten_journeys',
        name: 'Route Raider',
        description: 'Complete 10 journeys',
        category: 'frequency',
        xp: getAchievementXP('ten_journeys'),
        tiers: [
          { level: 1, threshold: 10, name: 'Route Raider', unlocked: user.totalTrips >= 10 },
        ],
        current: user.totalTrips,
        icon: '🏆',
        badge: true,
      },
      {
        id: 'fifty_journeys',
        name: 'Trail Dominator',
        description: 'Complete 50 journeys',
        category: 'frequency',
        xp: getAchievementXP('fifty_journeys'),
        tiers: [
          { level: 1, threshold: 50, name: 'Trail Dominator', unlocked: user.totalTrips >= 50 },
        ],
        current: user.totalTrips,
        icon: '🏆',
        badge: true,
      },
      {
        id: 'hour_rider',
        name: 'Time Master',
        description: 'Ride for 1 hour total',
        category: 'time',
        xp: getAchievementXP('hour_rider'),
        tiers: [
          { level: 1, threshold: 3600, name: '1 Hour Rider', unlocked: user.totalTime >= 3600 },
        ],
        current: user.totalTime,
        icon: '⏰',
        badge: true,
      },
      {
        id: 'ten_hours',
        name: 'Chrono Breaker',
        description: 'Ride for 10 hours total',
        category: 'time',
        xp: getAchievementXP('ten_hours'),
        tiers: [
          { level: 1, threshold: 36000, name: '10 Hour Wanderer', unlocked: user.totalTime >= 36000 },
        ],
        current: user.totalTime,
        icon: '⏰',
        badge: true,
      },
    ];
    
    // Calculate overall progress
    const totalTiers = achievements.reduce((sum, achievement) => sum + achievement.tiers.length, 0);
    const unlockedTiers = achievements.reduce((sum, achievement) => 
      sum + achievement.tiers.filter(tier => tier.unlocked).length, 0
    );
    
    // Get level progress
    const levelProgress = getLevelProgress(user.xp || 0, user.level || 1);
    
    res.json({
      success: true,
      achievements,
      summary: {
        totalAchievements: achievements.length,
        totalTiers,
        unlockedTiers,
        progress: totalTiers > 0 ? (unlockedTiers / totalTiers * 100).toFixed(1) : 0,
        accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      },
      xp: {
        current: user.xp || 0,
        level: user.level || 1,
        progress: levelProgress,
      },
    });
    
  } catch (error) {
    if (error?.code === 'P2024' || /connection pool timeout/i.test(error?.message || '')) {
      return res.status(503).json({ error: 'Service Unavailable', message: 'Database busy, please retry shortly' });
    }
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Failed to get achievements', message: error.message });
  }
});

/**
 * @route GET /api/user/friends
 * @desc Get user's friends list
 * @access Private
 */
router.get('/friends', async (req, res) => {
  try {
    const userId = req.user.id;
    
    
    // Get friends through group memberships
    const friends = await prisma.groupMember.findMany({
      where: {
        group: {
          members: {
            some: { userId }
          }
        },
        userId: { not: userId }
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
            totalDistance: true,
            totalTime: true,
            topSpeed: true,
            totalTrips: true,
          }
        }
      },
      distinct: ['userId']
    });
    
    // Format friends data
    const friendsList = friends.map(friend => ({
      id: friend.user.id,
      displayName: friend.user.displayName,
      photoURL: friend.user.photoURL,
      isOnline: false, // TODO: Implement real-time online status
      stats: {
        totalDistance: friend.user.totalDistance,
        totalTime: friend.user.totalTime,
        topSpeed: friend.user.topSpeed,
        totalTrips: friend.user.totalTrips,
      }
    }));
    
    res.json({
      success: true,
      friends: friendsList,
    });
    
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({
      error: 'Failed to get friends',
      message: error.message,
    });
  }
});

/**
 * @route POST /api/user/friends
 * @desc Add a friend (through group invitation)
 * @access Private
 */
router.post('/friends', async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId } = req.body;
    
    
    if (!friendId) {
      return res.status(400).json({
        error: 'Missing friend ID',
        message: 'friendId is required',
      });
    }
    
    if (friendId === userId) {
      return res.status(400).json({
        error: 'Invalid friend ID',
        message: 'Cannot add yourself as a friend',
      });
    }
    
    // Check if friend exists
    const friend = await prisma.user.findUnique({
      where: { id: friendId },
      select: { id: true, displayName: true }
    });
    
    if (!friend) {
      return res.status(404).json({
        error: 'Friend not found',
        message: 'User with this ID does not exist',
      });
    }
    
    // For now, we'll create a simple "friends" group
    // In a real implementation, you might want a separate friends table
    const group = await prisma.group.create({
      data: {
        name: `Friends: ${friend.displayName}`,
        description: 'Friends group',
        creatorId: userId,
        code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        maxMembers: 2,
        isPrivate: true,
        members: {
          create: [
            { userId, role: 'CREATOR' },
            { userId: friendId, role: 'MEMBER' }
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                photoURL: true,
              }
            }
          }
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Friend added successfully',
      group,
    });
    
  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({
      error: 'Failed to add friend',
      message: error.message,
    });
  }
});

/**
 * @route DELETE /api/user/profile-picture
 * @desc Remove profile picture
 * @access Private
 */
router.delete('/profile-picture', async (req, res) => {
  try {
    const userId = req.user.id;
    const { deleteFromStorage } = require('../services/Firebase');
    
    
    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { photoURL: true },
    });
    
    if (!user.photoURL) {
      return res.status(400).json({
        error: 'No profile picture',
        message: 'User does not have a profile picture',
      });
    }
    
    // Delete from Firebase Storage if it's our uploaded image
    if (user.photoURL.includes('profile-pictures/')) {
      try {
        const path = user.photoURL.split('/').slice(-2).join('/');
        await deleteFromStorage(path);
      } catch (deleteError) {
        console.warn('Failed to delete from storage:', deleteError);
      }
    }
    
    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        photoURL: null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        displayName: true,
        photoURL: true,
      },
    });
    
    res.json({
      success: true,
      message: 'Profile picture removed successfully',
      user: updatedUser,
    });
    
  } catch (error) {
    console.error('Remove profile picture error:', error);
    res.status(500).json({
      error: 'Failed to remove profile picture',
      message: error.message,
    });
  }
});

module.exports = router;