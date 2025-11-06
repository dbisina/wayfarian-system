// User Controller
// server/controllers/userController.js

const prisma = require('../prisma/client');
const { uploadToStorage, deleteFromStorage } = require('../services/Firebase');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// Use shared Prisma client (PgBouncer-friendly)

// Configure multer for profile picture upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for profile pictures
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

/**
 * Get user profile
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        displayName: true,
        photoURL: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found',
      });
    }
    
    // Get additional statistics
    const [
      recentJourneys,
      activeGroups,
      photoCount,
      recentActivity
    ] = await Promise.all([
      prisma.journey.findMany({
        where: { userId },
        orderBy: { startTime: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          totalDistance: true,
          totalTime: true,
          topSpeed: true,
          status: true,
        },
      }),
      prisma.groupMember.findMany({
        where: {
          userId,
          group: { isActive: true },
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              code: true,
              _count: {
                select: { members: true },
              },
            },
          },
        },
      }),
      prisma.photo.count({
        where: { userId },
      }),
      prisma.journey.count({
        where: {
          userId,
          startTime: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);
    
    res.json({
      success: true,
      user: {
        ...user,
        recentJourneys,
        groups: activeGroups.map(ag => ag.group),
        photoCount,
        recentActivity,
        accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      },
    });
    
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Failed to get user profile',
      message: error.message,
    });
  }
};

/**
 * Update user profile
 */
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { displayName, phoneNumber } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName && { displayName }),
        ...(phoneNumber && { phoneNumber }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        displayName: true,
        photoURL: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
        updatedAt: true,
      },
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });
    
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message,
    });
  }
};

/**
 * Upload profile picture
 */
const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide an image file',
      });
    }
    
    // Get current user to check for existing photo
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { photoURL: true },
    });
    
    // Process image - optimize for profile picture
    const filename = `profile_${userId}_${uuidv4()}.jpg`;
    
    // Create optimized profile picture (300x300)
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(300, 300, { 
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ 
        quality: 85,
        progressive: true,
      })
      .toBuffer();
    
    // Upload to storage (Cloudinary → Firebase → Local fallback)
    const imageUrl = await uploadToStorage(
      optimizedBuffer,
      filename,
      'image/jpeg',
      'profile-pictures'
    );
    
    // Update user profile with new photo URL
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        photoURL: imageUrl,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        displayName: true,
        photoURL: true,
      },
    });
    
    // Delete old profile picture if it exists and is from our storage
    if (currentUser.photoURL && currentUser.photoURL.includes('profile-pictures/')) {
      try {
        const oldPath = currentUser.photoURL.split('/').slice(-2).join('/');
        await deleteFromStorage(oldPath);
      } catch (deleteError) {
        console.warn('Failed to delete old profile picture:', deleteError);
      }
    }
    
    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      user: updatedUser,
      imageUrl,
    });
    
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      error: 'Failed to upload profile picture',
      message: error.message,
    });
  }
};

/**
 * Get user statistics
 */
const getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = 'allTime' } = req.query;
    
    // Calculate date range for timeframe
    let dateFilter = {};
    if (timeframe !== 'allTime') {
      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        dateFilter = {
          startTime: {
            gte: startDate,
          },
        };
      }
    }
    
    // Get user's basic stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
        createdAt: true,
      },
    });
    
    // Get timeframe-specific stats
    const journeyStats = await prisma.journey.aggregate({
      where: {
        userId,
        status: 'COMPLETED',
        ...dateFilter,
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
    
    // Get journey distribution by vehicle type
    const vehicleDistribution = await prisma.journey.groupBy({
      by: ['vehicle'],
      where: {
        userId,
        status: 'COMPLETED',
        ...dateFilter,
      },
      _count: true,
      _sum: {
        totalDistance: true,
      },
    });
    
    // Get monthly progress (last 12 months)
    const monthlyProgress = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', "startTime") as month,
        COUNT(*)::int as journeys,
        COALESCE(SUM("totalDistance"), 0)::float as distance,
        COALESCE(SUM("totalTime"), 0)::int as time
      FROM journeys 
      WHERE "userId" = ${userId} 
        AND status = 'COMPLETED'
        AND "startTime" >= ${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE_TRUNC('month', "startTime")
      ORDER BY month DESC
      LIMIT 12
    `;
    
    // Calculate averages
    const avgDistance = journeyStats._count > 0 ? 
      (journeyStats._sum.totalDistance || 0) / journeyStats._count : 0;
    const avgTime = journeyStats._count > 0 ? 
      (journeyStats._sum.totalTime || 0) / journeyStats._count : 0;
    
    res.json({
      success: true,
      stats: {
        timeframe,
        overview: {
          totalJourneys: timeframe === 'allTime' ? user.totalTrips : journeyStats._count,
          totalDistance: timeframe === 'allTime' ? user.totalDistance : (journeyStats._sum.totalDistance || 0),
          totalTime: timeframe === 'allTime' ? user.totalTime : (journeyStats._sum.totalTime || 0),
          topSpeed: timeframe === 'allTime' ? user.topSpeed : (journeyStats._max.topSpeed || 0),
          avgDistance,
          avgTime,
        },
        vehicleDistribution,
        monthlyProgress,
        accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      },
      generatedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Failed to get user statistics',
      message: error.message,
    });
  }
};

/**
 * Get user's journey history with filters
 */
const getJourneyHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      vehicle, 
      startDate, 
      endDate,
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const whereClause = {
      userId,
      ...(status && { status }),
      ...(vehicle && { vehicle }),
      ...(startDate && {
        startTime: {
          gte: new Date(startDate),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };
    
    // Build order by clause
    const validSortFields = ['startTime', 'endTime', 'totalDistance', 'totalTime', 'topSpeed'];
    const orderBy = validSortFields.includes(sortBy) ? 
      { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' } : 
      { startTime: 'desc' };
    
    const [journeys, total] = await Promise.all([
      prisma.journey.findMany({
        where: whereClause,
        orderBy,
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          group: {
            select: {
              id: true,
              name: true,
            },
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
      filters: {
        status,
        vehicle,
        startDate,
        endDate,
        sortBy,
        sortOrder,
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
 * Export user data (GDPR compliance)
 */
const exportUserData = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all user data
    const [user, journeys, photos, groupMemberships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
      }),
      prisma.journey.findMany({
        where: { userId },
        include: {
          group: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.photo.findMany({
        where: { userId },
        include: {
          journey: {
            select: { id: true, title: true },
          },
        },
      }),
      prisma.groupMember.findMany({
        where: { userId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              code: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        ...user,
        firebaseUid: undefined, // Remove sensitive data
      },
      journeys,
      photos: photos.map(photo => ({
        ...photo,
        firebasePath: undefined, // Remove internal paths
      })),
      groupMemberships,
      summary: {
        totalJourneys: journeys.length,
        totalPhotos: photos.length,
        totalGroups: groupMemberships.length,
        accountCreated: user.createdAt,
      },
    };
    
    res.json({
      success: true,
      data: exportData,
    });
    
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({
      error: 'Failed to export user data',
      message: error.message,
    });
  }
};

module.exports = {
  upload: upload.single('profilePicture'),
  getUserProfile,
  updateUserProfile,
  uploadProfilePicture,
  getUserStats,
  getJourneyHistory,
  exportUserData,
};