// Auth Controller
// server/controllers/authController.js

const prisma = require('../prisma/client');
const { verifyIdToken, createCustomToken } = require('../services/Firebase');

/**
 * Register/Login user with Firebase token
 */
const authenticateUser = async (req, res) => {
  const authStartTime = Date.now();
  const timings = {};
  
  try {
    const { idToken, phoneNumber, displayName, photoURL } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: 'ID token required',
        message: 'Firebase ID token is required',
      });
    }

    // Verify Firebase token
    const tokenVerifyStart = Date.now();
    const decodedToken = await verifyIdToken(idToken);
    timings.tokenVerify = Date.now() - tokenVerifyStart;

    // Upsert user atomically to avoid race/unique errors
    const dbStart = Date.now();
    const now = new Date();
    const inferredDisplayName = (() => {
      if (displayName) return displayName;
      if (decodedToken.name) return decodedToken.name;
      if (decodedToken.email && typeof decodedToken.email === 'string') {
        const beforeAt = decodedToken.email.split('@')[0];
        if (beforeAt) return beforeAt;
      }
      if (phoneNumber || decodedToken.phone_number) return (phoneNumber || decodedToken.phone_number);
      return 'Wayfarian User';
    })();

    const createData = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email || null,
      phoneNumber: phoneNumber || decodedToken.phone_number || null,
      displayName: inferredDisplayName,
      photoURL: photoURL || decodedToken.picture || null,
      createdAt: now,
      updatedAt: now,
    };

    // For updates, only include fields actually provided to avoid overwriting with generic fallbacks
    const updateData = {
      updatedAt: now,
      ...(decodedToken.email ? { email: decodedToken.email } : {}),
      ...(phoneNumber || decodedToken.phone_number ? { phoneNumber: phoneNumber || decodedToken.phone_number } : {}),
      ...(displayName || decodedToken.name ? { displayName: displayName || decodedToken.name } : {}),
      ...(photoURL || decodedToken.picture ? { photoURL: photoURL || decodedToken.picture } : {}),
    };

    let user;
    try {
      user = await prisma.user.upsert({
        where: { firebaseUid: decodedToken.uid },
        create: createData,
        update: updateData,
      });
    } catch (upsertError) {
      // Handle P2002 unique constraint error (race condition on email)
      if (upsertError.code === 'P2002') {
        // Another request created the user - try to find by firebaseUid
        user = await prisma.user.findUnique({
          where: { firebaseUid: decodedToken.uid },
        });

        if (!user && decodedToken.email) {
          // User might exist with same email but different firebaseUid
          // Update the existing user's firebaseUid
          user = await prisma.user.update({
            where: { email: decodedToken.email },
            data: {
              firebaseUid: decodedToken.uid,
              ...updateData,
            },
          });
        }

        if (!user) {
          throw upsertError; // Re-throw if we still can't find/update the user
        }
      } else {
        throw upsertError;
      }
    }
    timings.dbUpsert = Date.now() - dbStart;
    timings.total = Date.now() - authStartTime;

    // Log performance metrics
    console.log(`[Auth] Login completed in ${timings.total}ms (tokenVerify: ${timings.tokenVerify}ms, dbUpsert: ${timings.dbUpsert}ms)`);

    // Remove sensitive data
    const { firebaseUid, ...userData } = user;

    res.json({
      success: true,
      message: user.createdAt.getTime() === user.updatedAt.getTime() ? 'User registered successfully' : 'User authenticated successfully',
      user: userData,
      isNewUser: user.createdAt.getTime() === user.updatedAt.getTime(),
      _timings: process.env.NODE_ENV === 'development' ? timings : undefined,
    });

  } catch (error) {
    console.error('Authenticate user error:', error);

    if (error.message === 'Invalid Firebase token') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided Firebase token is invalid or expired',
      });
    }
    const msg = (error && error.message) || '';
    if (msg.includes('Timed out fetching a new connection') || msg.includes("Can't reach database server")) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database is temporarily unavailable. Please try again shortly.',
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
 * This performs a complete cleanup:
 * 1. Deletes all user images from Cloudinary
 * 2. Deletes the user from the database (cascade handles related records)
 * 3. Deletes the Firebase Auth user (so they can't log in anymore)
 */
const deleteAccount = async (req, res) => {
  const { adminAuth, firebaseInitialized } = require('../services/Firebase');
  const { deleteFromCloudinary, cloudinaryInitialized } = require('../services/CloudinaryService');

  try {
    const userId = req.user.id;
    const { confirmDelete } = req.body;

    if (!confirmDelete) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Please confirm account deletion by setting confirmDelete to true',
      });
    }

    // Get the full user record
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firebaseUid: true,
        photoURL: true,
        displayName: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist',
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

    console.log(`[DeleteAccount] Starting account anonymization for user ${userId}`);

    // ============================================
    // STEP 1: Identify Photos to Keep (Timeline)
    // ============================================
    const photosToKeep = new Set();
    
    // Find all RideEvents by this user that contain media
    const userTimelineEvents = await prisma.rideEvent.findMany({
      where: {
        userId,
        mediaUrl: { not: null },
      },
      select: { mediaUrl: true },
    });

    for (const event of userTimelineEvents) {
      if (event.mediaUrl) photosToKeep.add(event.mediaUrl);
    }

    // ============================================
    // STEP 2: Delete Images from Cloudinary
    // ============================================
    const imagesToDelete = [];

    // Add profile photo if not used in timeline (unlikely but possible)
    if (user.photoURL && user.photoURL.includes('cloudinary.com')) {
      if (!photosToKeep.has(user.photoURL)) {
        imagesToDelete.push(user.photoURL);
      }
    }

    // Get and process all user's Photos (gallery)
    const photos = await prisma.photo.findMany({
      where: { userId },
      select: { firebasePath: true, thumbnailPath: true },
    });

    for (const photo of photos) {
      if (photo.firebasePath?.includes('cloudinary.com') && !photosToKeep.has(photo.firebasePath)) {
        imagesToDelete.push(photo.firebasePath);
      }
      if (photo.thumbnailPath?.includes('cloudinary.com') && !photosToKeep.has(photo.thumbnailPath)) {
        imagesToDelete.push(photo.thumbnailPath);
      }
    }

    // Get all user's journey instances photos
    const journeyInstances = await prisma.journeyInstance.findMany({
      where: { userId },
      select: { id: true },
    });
    const instanceIds = journeyInstances.map(ji => ji.id);

    if (instanceIds.length > 0) {
      const journeyPhotos = await prisma.journeyPhoto.findMany({
        where: { instanceId: { in: instanceIds } },
        select: { firebasePath: true },
      });

      for (const jp of journeyPhotos) {
        if (jp.firebasePath?.includes('cloudinary.com') && !photosToKeep.has(jp.firebasePath)) {
          imagesToDelete.push(jp.firebasePath);
        }
      }
    }

    // Groups created by user (cover photos)
    const userGroups = await prisma.group.findMany({
      where: { creatorId: userId },
      select: { coverPhotoURL: true },
    });
    for (const group of userGroups) {
      if (group.coverPhotoURL?.includes('cloudinary.com') && !photosToKeep.has(group.coverPhotoURL)) {
        imagesToDelete.push(group.coverPhotoURL);
      }
    }

    // Perform Cloudinary Deletions
    if (cloudinaryInitialized && imagesToDelete.length > 0) {
      console.log(`[DeleteAccount] Deleting ${imagesToDelete.length} images from Cloudinary`);
      for (const imageUrl of imagesToDelete) {
        try {
          await deleteFromCloudinary(imageUrl);
        } catch (err) {
          console.error(`[DeleteAccount] Failed to delete Cloudinary image: ${imageUrl}`, err.message);
        }
      }
    }

    // ============================================
    // STEP 3: Manual Database Cleanup (Non-Cascade)
    // ============================================
    // Delete SOLO data that shouldn't be kept
    
    // Delete User's Photo Gallery records
    await prisma.photo.deleteMany({ where: { userId } });

    // Delete Solo Journeys (those without group link)
    // Note: Schema has groupId on Journey, but strictly solo journeys have no GroupJourney logic usually
    // We should delete all Journeys owned by user that are NOT part of a group history? 
    // Actually, Journey table is mostly for solo or legacy. Group history is in GroupJourney/JourneyInstance.
    // Safe to delete all entries in 'Journey' table for this user as they are personal.
    await prisma.journey.deleteMany({ where: { userId } });

    // Delete JourneyReminders
    await prisma.journeyReminder.deleteMany({ where: { userId } });

    // Delete sole-owned groups (and their cascade data)
    // Re-fetch groups where user is sole member
    const groupsToDelete = await prisma.group.findMany({
      where: { creatorId: userId, isActive: true },
      include: { _count: { select: { members: true } } },
    });
    const soleOwnerGroupIds = groupsToDelete.filter(g => g._count.members <= 1).map(g => g.id);

    if (soleOwnerGroupIds.length > 0) {
      // Manual cleanup for groups to be deleted (same as before)
      // ... (Using transaction or order to handle constraints)
      const groupJourneys = await prisma.groupJourney.findMany({
         where: { groupId: { in: soleOwnerGroupIds } },
         select: { id: true }
      });
      const gjIds = groupJourneys.map(gj => gj.id);
      
      if (gjIds.length > 0) {
        await prisma.rideEvent.deleteMany({ where: { groupJourneyId: { in: gjIds } } });
        await prisma.journeyInstance.deleteMany({ where: { groupJourneyId: { in: gjIds } } });
        await prisma.groupJourney.deleteMany({ where: { id: { in: gjIds } } });
      }
      await prisma.groupMember.deleteMany({ where: { groupId: { in: soleOwnerGroupIds } } });
      await prisma.group.deleteMany({ where: { id: { in: soleOwnerGroupIds } } });
    }

    // Remove user from groups where they are NOT the creator (Membership only)
    await prisma.groupMember.deleteMany({
      where: { userId, role: { not: 'CREATOR' } }
    });

    // ============================================
    // STEP 4: Anonymize User Record
    // ============================================
    // We keep the ID and Display Name for history, but wipe everything else.
    // We change firebaseUid to a deleted-timestamp format to free up the slot.
    const anonymizedUid = `deleted_${userId}_${Date.now()}`;
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        firebaseUid: anonymizedUid,
        email: null,
        phoneNumber: null,
        photoURL: null, // Profile pic ref is gone (image deleted above if not in keep list)
        expoPushToken: null,
        country: null,
        countryCode: null,
        // Reset stats maybe? Optional, but safer to zero out.
        totalDistance: 0,
        totalTime: 0,
        topSpeed: 0,
        totalTrips: 0,
        xp: 0,
        level: 1,
        // displayName is PRESERVED
      },
    });

    console.log(`[DeleteAccount] User record anonymized for ${userId}`);

    // ============================================
    // STEP 5: Delete Firebase Auth User
    // ============================================
    if (firebaseInitialized && adminAuth && user.firebaseUid) {
      try {
        await adminAuth.deleteUser(user.firebaseUid);
        console.log(`[DeleteAccount] Firebase Auth user deleted: ${user.firebaseUid}`);
      } catch (firebaseError) {
        console.error(`[DeleteAccount] Failed to delete Firebase Auth user`, firebaseError.message);
      }
    }

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