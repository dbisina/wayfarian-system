// Gallery Routes
// server/routes/gallery.js

const express = require('express');
const prisma = require('../prisma/client');
const { body, param, query, validationResult } = require('express-validator');
const {
  upload,
  uploadPhoto,
  getJourneyPhotos,
  getUserPhotos,
  deletePhoto,
  updatePhotoMetadata,
  getPhotoById,
} = require('../controllers/galleryController');

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
 * @route POST /api/gallery/upload
 * @desc Upload a photo to gallery
 * @access Private
 */
router.post(
  '/upload',
  upload, // Multer middleware for file upload
  [
    // IDs are Prisma CUID strings, not UUID
    body('journeyId')
      .optional()
      .isString()
      .withMessage('Invalid journey ID'),
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('takenAt')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format'),
  ],
  handleValidationErrors,
  uploadPhoto
);

/**
 * @route GET /api/gallery/journey/:journeyId
 * @desc Get all photos for a specific journey
 * @access Private
 */
router.get(
  '/journey/:journeyId',
  [
    // IDs are Prisma CUID strings, not UUID
    param('journeyId')
      .isString()
      .withMessage('Invalid journey ID'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
  ],
  handleValidationErrors,
  getJourneyPhotos
);

/**
 * @route GET /api/gallery/photos
 * @desc Get all user photos (with optional journey filter)
 * @access Private
 */
router.get(
  '/photos',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    // IDs are Prisma CUID strings, not UUID
    query('journeyId')
      .optional()
      .isString()
      .withMessage('Invalid journey ID'),
  ],
  handleValidationErrors,
  getUserPhotos
);

/**
 * @route GET /api/gallery/photo/:photoId
 * @desc Get specific photo details
 * @access Private
 */
router.get(
  '/photo/:photoId',
  [
    // IDs are Prisma CUID strings, not UUID
    param('photoId')
      .isString()
      .withMessage('Invalid photo ID'),
  ],
  handleValidationErrors,
  getPhotoById
);

/**
 * @route PUT /api/gallery/photo/:photoId/metadata
 * @desc Update photo metadata (location, timestamp)
 * @access Private
 */
router.put(
  '/photo/:photoId/metadata',
  [
    // IDs are Prisma CUID strings, not UUID
    param('photoId')
      .isString()
      .withMessage('Invalid photo ID'),
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('takenAt')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format'),
  ],
  handleValidationErrors,
  updatePhotoMetadata
);

/**
 * @route DELETE /api/gallery/photo/:photoId
 * @desc Delete a photo
 * @access Private
 */
router.delete(
  '/photo/:photoId',
  [
    // IDs are Prisma CUID strings, not UUID
    param('photoId')
      .isString()
      .withMessage('Invalid photo ID'),
  ],
  handleValidationErrors,
  deletePhoto
);

/**
 * @route POST /api/gallery/bulk-upload
 * @desc Upload multiple photos at once
 * @access Private
 */
router.post(
  '/bulk-upload',
  // TODO: Implement bulk upload functionality
  (req, res) => {
    res.status(501).json({
      error: 'Not implemented',
      message: 'Bulk upload feature will be implemented in Phase 2',
    });
  }
);

/**
 * @route GET /api/gallery/stats
 * @desc Get user's gallery statistics
 * @access Private
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    
    
    const [totalPhotos, totalSize, recentPhotos] = await Promise.all([
      prisma.photo.count({
        where: { userId },
      }),
      prisma.photo.aggregate({
        where: { userId },
        _sum: { fileSize: true },
      }),
      prisma.photo.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);
    
    res.json({
      success: true,
      stats: {
        totalPhotos,
        totalSize: totalSize._sum.fileSize || 0,
        recentPhotos,
        averageFileSize: totalPhotos > 0 ? (totalSize._sum.fileSize || 0) / totalPhotos : 0,
      },
    });
    
  } catch (error) {
    console.error('Get gallery stats error:', error);
    res.status(500).json({
      error: 'Failed to get gallery stats',
      message: error.message,
    });
  }
});

module.exports = router;