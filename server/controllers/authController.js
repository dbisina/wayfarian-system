// Auth Controller
// server/controllers/authController.js

const { PrismaClient } = require('@prisma/client');
const { verifyIdToken, createCustomToken } = require('../services/Firebase');

const prisma = new PrismaClient();

/**
 * Register/Login user with Firebase token
 */
const authenticateUser = async (req, res) => {
  try {
    const { idToken, phoneNumber, displayName, photoURL } = req.body;
    
    if (!idToken) {
      return res.status(400).json({
        error: 'ID token required',
        message: 'Firebase ID token is required',
      });
    }
    
    // Verify Firebase token
    const decodedToken = await verifyIdToken(idToken);
    
    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });
    
    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          firebaseUid: decodedToken.uid,
          email: decodedToken.email,
          phoneNumber: phoneNumber || decodedToken.phone_number,
          displayName: displayName || decodedToken.name || 'Wayfarian User',
          photoURL: photoURL || decodedToken.picture,
        },
      });
    } else {
      // Update existing user with latest info
      user = await prisma.user.update({
        where: { firebaseUid: decodedToken.uid },
        data: {
          ...(decodedToken.email && { email: decodedToken.email }),
          ...(phoneNumber && { phoneNumber }),
          ...(displayName && { displayName }),
          ...(photoURL && { photoURL }),
          updatedAt: new Date(),
        },
      });
    }
    
    // Remove sensitive data
    const { firebaseUid, ...userData } = user;
    
    res.json({
      success: true,
      message: user.createdAt === user.updatedAt ? 'User registered successfully' : 'User authenticated successfully',
      user: userData,
      isNewUser: user.createdAt === user.updatedAt,
    });
    
  } catch (error) {
    console.error('Authenticate user error:', error);
    
    if (error.message === 'Invalid Firebase token') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided Firebase token is invalid or expired',
      });
    }
    
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
    });
  }
};

/**
 * Refresh user token
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        message: 'Refresh token is required',
      });
    }
    
    // Note: In a real app, you might want to implement custom refresh logic
    // For now, we'll just verify the current token
    const decodedToken = await verifyIdToken(refreshToken);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found in database',
      });
    }
    
    // Create new custom token if needed
    const customToken = await createCustomToken(decodedToken.uid);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      customToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Invalid or expired refresh token',
    });
  }
};

/**
 * Logout user (cleanup sessions)
 */
const logout = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Update user's last seen and clear any active sessions
    await prisma.user.update({
      where: { id: userId },
      data: {
        updatedAt: new Date(),
      },
    });
    
    // Clear any active location sharing in groups
    await prisma.groupMember.updateMany({
      where: {
        userId,
        isLocationShared: true,
      },
      data: {
        isLocationShared: false,
        lastSeen: new Date(),
      },
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message,
    });
  }
};

/**
 * Get current user profile
 */
const getCurrentUser = async (req, res) => {
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
    
    // Get user's active journey if any
    const activeJourney = await prisma.journey.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
      },
    });
    
    // Get user's groups count
    const groupsCount = await prisma.groupMember.count({
      where: {
        userId,
        group: { isActive: true },
      },
    });
    
    res.json({
      success: true,
      user: {
        ...user,
        activeJourney,
        groupsCount,
      },
    });
    
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      error: 'Failed to get user profile',
      message: error.message,
    });
  }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { displayName, phoneNumber } = req.body;
    
    // Update user profile
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
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message,
    });
  }
};

/**
 * Delete user account
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { confirmDelete } = req.body;
    
    if (!confirmDelete) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Please confirm account deletion by setting confirmDelete to true',
      });
    }
    
    // Get user's active groups where they are creators
    const createdGroups = await prisma.group.findMany({
      where: {
        creatorId: userId,
        isActive: true,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });
    
    // Check if user is creator of groups with other members
    const groupsWithMembers = createdGroups.filter(group => group._count.members > 1);
    
    if (groupsWithMembers.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete account',
        message: 'You are the creator of groups with other members. Please transfer ownership or delete the groups first.',
        groupsWithMembers: groupsWithMembers.map(g => ({ id: g.id, name: g.name, memberCount: g._count.members })),
      });
    }
    
    // Deactivate groups where user is the only member
    await prisma.group.updateMany({
      where: {
        creatorId: userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    
    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId },
    });
    
    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
    
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      error: 'Failed to delete account',
      message: error.message,
    });
  }
};

/**
 * Check if email/phone is available
 */
const checkAvailability = async (req, res) => {
  try {
    const { email, phoneNumber } = req.query;
    
    if (!email && !phoneNumber) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Please provide email or phoneNumber to check',
      });
    }
    
    const checks = {};
    
    if (email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      checks.email = {
        value: email,
        available: !emailExists,
      };
    }
    
    if (phoneNumber) {
      const phoneExists = await prisma.user.findUnique({
        where: { phoneNumber },
        select: { id: true },
      });
      checks.phoneNumber = {
        value: phoneNumber,
        available: !phoneExists,
      };
    }
    
    res.json({
      success: true,
      checks,
    });
    
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      error: 'Failed to check availability',
      message: error.message,
    });
  }
};

module.exports = {
  authenticateUser,
  refreshToken,
  logout,
  getCurrentUser,
  updateProfile,
  deleteAccount,
  checkAvailability,
};