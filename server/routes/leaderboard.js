// Leaderboard Routes
// server/routes/leaderboard.js

const express = require('express');
const prisma = require('../prisma/client');
const { param, query, validationResult } = require('express-validator');
const {
  getGlobalLeaderboard,
  getFriendsLeaderboard,
  getGroupLeaderboard,
  getUserPosition,
  getAchievements,
} = require('../controllers/leaderboardController');

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
 * @route GET /api/leaderboard/global
 * @desc Get global leaderboard rankings
 * @access Private
 */
router.get(
  '/global',
  [
    query('sortBy')
      .optional()
      .isIn(['totalDistance', 'topSpeed', 'totalTrips', 'totalTime'])
      .withMessage('Invalid sort option'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('timeFrame')
      .optional()
      .isIn(['allTime', 'week', 'month', 'year'])
      .withMessage('Invalid time frame'),
  ],
  handleValidationErrors,
  getGlobalLeaderboard
);

/**
 * @route GET /api/leaderboard/friends
 * @desc Get friends leaderboard rankings
 * @access Private
 */
router.get(
  '/friends',
  [
    query('sortBy')
      .optional()
      .isIn(['totalDistance', 'topSpeed', 'totalTrips', 'totalTime'])
      .withMessage('Invalid sort option'),
    query('timeFrame')
      .optional()
      .isIn(['allTime', 'week', 'month', 'year'])
      .withMessage('Invalid time frame'),
  ],
  handleValidationErrors,
  getFriendsLeaderboard
);

/**
 * @route GET /api/leaderboard/group/:groupId
 * @desc Get group leaderboard rankings
 * @access Private
 */
router.get(
  '/group/:groupId',
  [
    // IDs are Prisma CUID strings, not UUID
    param('groupId').isString().withMessage('Invalid group ID'),
    query('sortBy')
      .optional()
      .isIn(['totalDistance', 'topSpeed', 'totalTrips', 'totalTime'])
      .withMessage('Invalid sort option'),
    query('timeFrame')
      .optional()
      .isIn(['allTime', 'week', 'month', 'year'])
      .withMessage('Invalid time frame'),
  ],
  handleValidationErrors,
  getGroupLeaderboard
);

/**
 * @route GET /api/leaderboard/position
 * @desc Get current user's position in global leaderboard
 * @access Private
 */
router.get(
  '/position',
  [
    query('sortBy')
      .optional()
      .isIn(['totalDistance', 'topSpeed', 'totalTrips', 'totalTime'])
      .withMessage('Invalid sort option'),
  ],
  handleValidationErrors,
  getUserPosition
);

/**
 * @route GET /api/leaderboard/achievements
 * @desc Get user's achievements and milestones
 * @access Private
 */
router.get('/achievements', getAchievements);

/**
 * @route GET /api/leaderboard/stats
 * @desc Get overall leaderboard statistics
 * @access Private
 */
router.get('/stats', async (req, res) => {
  try {
    
    
    const [
      totalUsers,
      activeUsers,
      totalJourneys,
      totalDistance,
      topSpeed,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          totalTrips: { gt: 0 },
        },
      }),
      prisma.journey.count({
        where: { status: 'COMPLETED' },
      }),
      prisma.user.aggregate({
        _sum: { totalDistance: true },
      }),
      prisma.user.aggregate({
        _max: { topSpeed: true },
      }),
    ]);
    
    // Get recent activity (last 7 days)
    const recentActivity = await prisma.journey.count({
      where: {
        status: 'COMPLETED',
        endTime: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        totalJourneys,
        totalDistance: totalDistance._sum.totalDistance || 0,
        globalTopSpeed: topSpeed._max.topSpeed || 0,
        recentActivity,
        activityRate: totalUsers > 0 ? (activeUsers / totalUsers * 100).toFixed(1) : 0,
      },
      generatedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Get leaderboard stats error:', error);
    res.status(500).json({
      error: 'Failed to get leaderboard stats',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/leaderboard/top-performers
 * @desc Get top performers across different categories
 * @access Private
 */
router.get('/top-performers', async (req, res) => {
  try {
    
    
    const [
      topDistance,
      topSpeed,
      topTrips,
      topTime,
    ] = await Promise.all([
      prisma.user.findFirst({
        where: { totalDistance: { gt: 0 } },
        select: {
          id: true,
          displayName: true,
          photoURL: true,
          totalDistance: true,
        },
        orderBy: { totalDistance: 'desc' },
      }),
      prisma.user.findFirst({
        where: { topSpeed: { gt: 0 } },
        select: {
          id: true,
          displayName: true,
          photoURL: true,
          topSpeed: true,
        },
        orderBy: { topSpeed: 'desc' },
      }),
      prisma.user.findFirst({
        where: { totalTrips: { gt: 0 } },
        select: {
          id: true,
          displayName: true,
          photoURL: true,
          totalTrips: true,
        },
        orderBy: { totalTrips: 'desc' },
      }),
      prisma.user.findFirst({
        where: { totalTime: { gt: 0 } },
        select: {
          id: true,
          displayName: true,
          photoURL: true,
          totalTime: true,
        },
        orderBy: { totalTime: 'desc' },
      }),
    ]);
    
    res.json({
      success: true,
      topPerformers: {
        distance: topDistance,
        speed: topSpeed,
        trips: topTrips,
        time: topTime,
      },
      generatedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Get top performers error:', error);
    res.status(500).json({
      error: 'Failed to get top performers',
      message: error.message,
    });
  }
});

module.exports = router;