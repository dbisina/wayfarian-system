// Auth Routes
// server/routes/auth.js

const express = require('express');
const prisma = require('../prisma/client');
const { body, query, validationResult } = require('express-validator');
const {
  authenticateUser,
  refreshToken,
  logout,
  getCurrentUser,
  updateProfile,
  deleteAccount,
  checkAvailability,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

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
 * @route POST /api/auth/login
 * @desc Authenticate user with Firebase token
 * @access Public
 */
router.post(
  '/login',
  [
    body('idToken')
      .notEmpty()
      .withMessage('Firebase ID token is required'),
    body('phoneNumber')
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number format'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name must be between 1 and 50 characters'),
    body('photoURL')
      .optional()
      .isURL()
      .withMessage('Invalid photo URL format'),
  ],
  handleValidationErrors,
  authenticateUser
);

/**
 * @route POST /api/auth/register
 * @desc Register new user (same as login - Firebase handles registration)
 * @access Public
 */
router.post(
  '/register',
  [
    body('idToken')
      .notEmpty()
      .withMessage('Firebase ID token is required'),
    body('phoneNumber')
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number format'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name must be between 1 and 50 characters'),
    body('photoURL')
      .optional()
      .isURL()
      .withMessage('Invalid photo URL format'),
  ],
  handleValidationErrors,
  authenticateUser
);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh user token
 * @access Public
 */
router.post(
  '/refresh',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required'),
  ],
  handleValidationErrors,
  refreshToken
);

/**
 * @route POST /api/auth/logout
 * @desc Logout user and cleanup sessions
 * @access Private
 */
router.post('/logout', authMiddleware, logout);

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', authMiddleware, getCurrentUser);

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put(
  '/profile',
  authMiddleware,
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
  updateProfile
);

/**
 * @route DELETE /api/auth/account
 * @desc Delete user account
 * @access Private
 */
router.delete(
  '/account',
  authMiddleware,
  [
    body('confirmDelete')
      .isBoolean()
      .withMessage('confirmDelete must be a boolean')
      .custom((value) => {
        if (!value) {
          throw new Error('Account deletion must be confirmed');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  deleteAccount
);

/**
 * @route GET /api/auth/check-availability
 * @desc Check if email or phone number is available
 * @access Public
 */
router.get(
  '/check-availability',
  [
    query('email')
      .optional()
      .isEmail()
      .withMessage('Invalid email format'),
    query('phoneNumber')
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number format'),
  ],
  handleValidationErrors,
  checkAvailability
);

/**
 * @route GET /api/auth/verify-token
 * @desc Verify if current token is valid
 * @access Private
 */
router.get('/verify-token', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      photoURL: req.user.photoURL,
    },
    tokenInfo: {
      firebaseUid: req.firebaseUser.uid,
      issuedAt: new Date(req.firebaseUser.iat * 1000),
      expiresAt: new Date(req.firebaseUser.exp * 1000),
    },
  });
});

/**
 * @route POST /api/auth/update-firebase-profile
 * @desc Update profile with latest Firebase user data
 * @access Private
 */
router.post('/update-firebase-profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const firebaseUser = req.firebaseUser;
    
    
    // Update user with latest Firebase data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firebaseUser.email && { email: firebaseUser.email }),
        ...(firebaseUser.name && { displayName: firebaseUser.name }),
        ...(firebaseUser.picture && { photoURL: firebaseUser.picture }),
        ...(firebaseUser.phone_number && { phoneNumber: firebaseUser.phone_number }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        displayName: true,
        photoURL: true,
        updatedAt: true,
      },
    });
    
    res.json({
      success: true,
      message: 'Profile updated with Firebase data',
      user: updatedUser,
    });
    
  } catch (error) {
    console.error('Update Firebase profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message,
    });
  }
});

/**
 * @route GET /api/auth/stats
 * @desc Get authentication-related statistics
 * @access Private
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    
    const [
      totalJourneys,
      activeGroups,
      totalPhotos,
      accountAge,
    ] = await Promise.all([
      prisma.journey.count({
        where: { userId },
      }),
      prisma.groupMember.count({
        where: {
          userId,
          group: { isActive: true },
        },
      }),
      prisma.photo.count({
        where: { userId },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      }),
    ]);
    
    const daysSinceJoined = Math.floor(
      (new Date() - new Date(accountAge.createdAt)) / (1000 * 60 * 60 * 24)
    );
    
    res.json({
      success: true,
      stats: {
        totalJourneys,
        activeGroups,
        totalPhotos,
        daysSinceJoined,
        accountCreated: accountAge.createdAt,
      },
    });
    
  } catch (error) {
    console.error('Get auth stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message,
    });
  }
});

module.exports = router;