// Leaderboard Controller
// server/controllers/leaderboardController.js

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Get global leaderboard
 */
const getGlobalLeaderboard = async (req, res) => {
  try {
    const { 
      sortBy = 'totalDistance', 
      page = 1, 
      limit = 50,
      timeFrame = 'allTime' 
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Define valid sort options
    const validSortOptions = {
      totalDistance: 'totalDistance',
      topSpeed: 'topSpeed',
      totalTrips: 'totalTrips',
      totalTime: 'totalTime',
    };
    
    const sortField = validSortOptions[sortBy] || 'totalDistance';
    
    // Get time frame filter
    let timeFilter = {};
    if (timeFrame !== 'allTime') {
      const now = new Date();
      let startDate;
      
      switch (timeFrame) {
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
        timeFilter = {
          updatedAt: {
            gte: startDate,
          },
        };
      }
    }
    
    // Get users with stats, filtered by time if needed
    let users;
    if (timeFrame === 'allTime') {
      users = await prisma.user.findMany({
        select: {
          id: true,
          displayName: true,
          photoURL: true,
          totalDistance: true,
          totalTime: true,
          topSpeed: true,
          totalTrips: true,
          createdAt: true,
        },
        where: {
          [sortField]: {
            gt: 0, // Only include users with activity
          },
        },
        orderBy: {
          [sortField]: 'desc',
        },
        skip: parseInt(skip),
        take: parseInt(limit),
      });
    } else {
      // For time-based filtering, we need to aggregate from journeys
      users = await prisma.$queryRaw`
        SELECT 
          u.id,
          u."displayName",
          u."photoURL",
          COALESCE(SUM(j."totalDistance"), 0) as "totalDistance",
          COALESCE(SUM(j."totalTime"), 0) as "totalTime",
          COALESCE(MAX(j."topSpeed"), 0) as "topSpeed",
          COALESCE(COUNT(j.id), 0) as "totalTrips"
        FROM users u
        LEFT JOIN journeys j ON u.id = j."userId" 
          AND j."updatedAt" >= ${startDate}
          AND j.status = 'COMPLETED'
        GROUP BY u.id, u."displayName", u."photoURL"
        HAVING COALESCE(SUM(j."totalDistance"), 0) > 0
        ORDER BY ${sortField} DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(skip)}
      `;
    }
    
    // Add rank to each user
    const leaderboard = users.map((user, index) => ({
      ...user,
      rank: skip + index + 1,
      totalDistance: parseFloat(user.totalDistance) || 0,
      totalTime: parseInt(user.totalTime) || 0,
      topSpeed: parseFloat(user.topSpeed) || 0,
      totalTrips: parseInt(user.totalTrips) || 0,
    }));
    
    // Get total count for pagination
    const totalUsers = await prisma.user.count({
      where: {
        [sortField]: {
          gt: 0,
        },
      },
    });
    
    res.json({
      success: true,
      leaderboard,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit),
      },
      metadata: {
        sortBy,
        timeFrame,
        generatedAt: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Get global leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get global leaderboard',
      message: error.message,
    });
  }
};

/**
 * Get friends leaderboard
 */
const getFriendsLeaderboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sortBy = 'totalDistance', timeFrame = 'allTime' } = req.query;
    
    // Get user's groups to find friends
    const userGroups = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
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
                  },
                },
              },
            },
          },
        },
      },
    });
    
    // Collect all unique friend user IDs
    const friendIds = new Set();
    userGroups.forEach(group => {
      group.group.members.forEach(member => {
        if (member.userId !== userId) {
          friendIds.add(member.userId);
        }
      });
    });
    
    // Add current user to the list
    friendIds.add(userId);
    
    if (friendIds.size === 0) {
      return res.json({
        success: true,
        leaderboard: [],
        message: 'No friends found. Join groups to see friends leaderboard.',
      });
    }
    
    const validSortOptions = {
      totalDistance: 'totalDistance',
      topSpeed: 'topSpeed',
      totalTrips: 'totalTrips',
      totalTime: 'totalTime',
    };
    
    const sortField = validSortOptions[sortBy] || 'totalDistance';
    
    // Get friends' stats
    const friends = await prisma.user.findMany({
      where: {
        id: {
          in: Array.from(friendIds),
        },
      },
      select: {
        id: true,
        displayName: true,
        photoURL: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
      },
      orderBy: {
        [sortField]: 'desc',
      },
    });
    
    // Add rank and highlight current user
    const leaderboard = friends.map((friend, index) => ({
      ...friend,
      rank: index + 1,
      isCurrentUser: friend.id === userId,
    }));
    
    res.json({
      success: true,
      leaderboard,
      metadata: {
        sortBy,
        timeFrame,
        totalFriends: friendIds.size,
        generatedAt: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Get friends leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get friends leaderboard',
      message: error.message,
    });
  }
};

/**
 * Get group leaderboard
 */
const getGroupLeaderboard = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { sortBy = 'totalDistance', timeFrame = 'allTime' } = req.query;
    
    // Verify user is member of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });
    
    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group',
      });
    }
    
    const validSortOptions = {
      totalDistance: 'totalDistance',
      topSpeed: 'topSpeed',
      totalTrips: 'totalTrips',
      totalTime: 'totalTime',
    };
    
    const sortField = validSortOptions[sortBy] || 'totalDistance';
    
    // Get group members with their stats
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId },
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
          },
        },
      },
      orderBy: {
        user: {
          [sortField]: 'desc',
        },
      },
    });
    
    // Format leaderboard
    const leaderboard = groupMembers.map((member, index) => ({
      ...member.user,
      rank: index + 1,
      isCurrentUser: member.user.id === userId,
      joinedAt: member.joinedAt,
      role: member.role,
    }));
    
    // Get group info
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
      },
    });
    
    res.json({
      success: true,
      leaderboard,
      group,
      metadata: {
        sortBy,
        timeFrame,
        totalMembers: groupMembers.length,
        generatedAt: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Get group leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to get group leaderboard',
      message: error.message,
    });
  }
};

/**
 * Get user's position in global leaderboard
 */
const getUserPosition = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sortBy = 'totalDistance' } = req.query;
    
    const validSortOptions = {
      totalDistance: 'totalDistance',
      topSpeed: 'topSpeed',
      totalTrips: 'totalTrips',
      totalTime: 'totalTime',
    };
    
    const sortField = validSortOptions[sortBy] || 'totalDistance';
    
    // Get user's stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        photoURL: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found',
      });
    }
    
    // Get user's position
    const usersAbove = await prisma.user.count({
      where: {
        [sortField]: {
          gt: user[sortField],
        },
      },
    });
    
    const position = usersAbove + 1;
    
    // Get total users with activity
    const totalActiveUsers = await prisma.user.count({
      where: {
        [sortField]: {
          gt: 0,
        },
      },
    });
    
    res.json({
      success: true,
      user: {
        ...user,
        position,
        percentile: totalActiveUsers > 0 ? ((totalActiveUsers - position + 1) / totalActiveUsers * 100).toFixed(1) : 0,
      },
      leaderboardStats: {
        totalActiveUsers,
        sortBy,
      },
    });
    
  } catch (error) {
    console.error('Get user position error:', error);
    res.status(500).json({
      error: 'Failed to get user position',
      message: error.message,
    });
  }
};

/**
 * Get leaderboard achievements/milestones
 */
const getAchievements = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found',
      });
    }
    
    // Define achievement thresholds
    const achievements = [
      {
        id: 'first_journey',
        name: 'First Journey',
        description: 'Complete your first journey',
        threshold: 1,
        current: user.totalTrips,
        type: 'totalTrips',
        unlocked: user.totalTrips >= 1,
      },
      {
        id: 'hundred_km',
        name: '100 KM Explorer',
        description: 'Travel 100 kilometers total',
        threshold: 100,
        current: user.totalDistance,
        type: 'totalDistance',
        unlocked: user.totalDistance >= 100,
      },
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Reach 100 km/h top speed',
        threshold: 100,
        current: user.topSpeed,
        type: 'topSpeed',
        unlocked: user.topSpeed >= 100,
      },
      {
        id: 'road_warrior',
        name: 'Road Warrior',
        description: 'Complete 50 journeys',
        threshold: 50,
        current: user.totalTrips,
        type: 'totalTrips',
        unlocked: user.totalTrips >= 50,
      },
      {
        id: 'thousand_km',
        name: '1000 KM Adventurer',
        description: 'Travel 1000 kilometers total',
        threshold: 1000,
        current: user.totalDistance,
        type: 'totalDistance',
        unlocked: user.totalDistance >= 1000,
      },
    ];
    
    res.json({
      success: true,
      achievements,
      summary: {
        totalAchievements: achievements.length,
        unlockedCount: achievements.filter(a => a.unlocked).length,
        progress: (achievements.filter(a => a.unlocked).length / achievements.length * 100).toFixed(1),
      },
    });
    
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({
      error: 'Failed to get achievements',
      message: error.message,
    });
  }
};

module.exports = {
  getGlobalLeaderboard,
  getFriendsLeaderboard,
  getGroupLeaderboard,
  getUserPosition,
  getAchievements,
};