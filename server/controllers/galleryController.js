// Gallery Controller
// server/controllers/galleryController.js

const prisma = require('../prisma/client');
const { uploadToStorage, deleteFromStorage } = require('../services/Firebase');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// Use shared Prisma client (singleton)

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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
 * Upload photo to gallery
 */
const uploadPhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const { journeyId, latitude, longitude, takenAt } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide an image file',
      });
    }
    
    // Verify journey belongs to user if journeyId provided
    if (journeyId) {
      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
        },
      });
      
      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Journey not found for this user',
        });
      }
    }
    
    // Generate unique filename
    const fileExtension = req.file.originalname.split('.').pop();
    const filename = `${uuidv4()}.${fileExtension}`;
    const firebasePath = `users/${userId}/${journeyId || 'general'}/${filename}`;
    
    // Process image - create thumbnail and optimize
    const originalBuffer = req.file.buffer;
    const thumbnailBuffer = await sharp(originalBuffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    const optimizedBuffer = await sharp(originalBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    // Upload to Firebase Storage
    const [imageUrl, thumbnailUrl] = await Promise.all([
      uploadToStorage(optimizedBuffer, filename, 'image/jpeg', `users/${userId}/${journeyId || 'general'}`),
      uploadToStorage(thumbnailBuffer, `thumb_${filename}`, 'image/jpeg', `users/${userId}/${journeyId || 'general'}/thumbnails`),
    ]);
    
    // Save photo metadata to database
    const photo = await prisma.photo.create({
      data: {
        userId,
        journeyId: journeyId || null,
        filename,
        originalName: req.file.originalname,
        firebasePath,
        thumbnailPath: `users/${userId}/${journeyId || 'general'}/thumbnails/thumb_${filename}`,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        takenAt: takenAt ? new Date(takenAt) : new Date(),
        deviceInfo: {
          userAgent: req.headers['user-agent'],
          uploadedAt: new Date().toISOString(),
        },
        isProcessed: true,
      },
    });
    
    res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully',
      photo: {
        ...photo,
        imageUrl,
        thumbnailUrl,
      },
    });
    
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({
      error: 'Failed to upload photo',
      message: error.message,
    });
  }
};

/**
 * Get photos for a journey
 */
const getJourneyPhotos = async (req, res) => {
  try {
    const { journeyId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    // Verify journey belongs to user
    const journey = await prisma.journey.findFirst({
      where: {
        id: journeyId,
        userId,
      },
    });
    
    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
        message: 'Journey not found for this user',
      });
    }
    
    const skip = (page - 1) * limit;
    
    const [photos, total] = await Promise.all([
      prisma.photo.findMany({
        where: {
          journeyId,
          userId,
        },
        orderBy: { takenAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit),
      }),
      prisma.photo.count({
        where: {
          journeyId,
          userId,
        },
      }),
    ]);
    
    res.json({
      success: true,
      photos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
    
  } catch (error) {
    console.error('Get journey photos error:', error);
    res.status(500).json({
      error: 'Failed to get photos',
      message: error.message,
    });
  }
};

/**
 * Get all user photos
 */
const getUserPhotos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, journeyId } = req.query;
    
    const skip = (page - 1) * limit;
    
    const whereClause = {
      userId,
      ...(journeyId && { journeyId }),
    };
    
    const [photos, total] = await Promise.all([
      prisma.photo.findMany({
        where: whereClause,
        orderBy: { takenAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit),
        include: {
          journey: {
            select: {
              id: true,
              title: true,
              startTime: true,
            },
          },
        },
      }),
      prisma.photo.count({ where: whereClause }),
    ]);
    
    res.json({
      success: true,
      photos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
    
  } catch (error) {
    console.error('Get user photos error:', error);
    res.status(500).json({
      error: 'Failed to get photos',
      message: error.message,
    });
  }
};

/**
 * Delete photo
 */
const deletePhoto = async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;
    
    // Get photo details
    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        userId,
      },
    });
    
    if (!photo) {
      return res.status(404).json({
        error: 'Photo not found',
        message: 'Photo not found for this user',
      });
    }
    
    // Delete from Firebase Storage
    await Promise.all([
      deleteFromStorage(photo.firebasePath),
      photo.thumbnailPath && deleteFromStorage(photo.thumbnailPath),
    ]);
    
    // Delete from database
    await prisma.photo.delete({
      where: { id: photoId },
    });
    
    res.json({
      success: true,
      message: 'Photo deleted successfully',
    });
    
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({
      error: 'Failed to delete photo',
      message: error.message,
    });
  }
};

/**
 * Update photo metadata
 */
const updatePhotoMetadata = async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;
    const { latitude, longitude, takenAt } = req.body;
    
    // Verify photo belongs to user
    const existingPhoto = await prisma.photo.findFirst({
      where: {
        id: photoId,
        userId,
      },
    });
    
    if (!existingPhoto) {
      return res.status(404).json({
        error: 'Photo not found',
        message: 'Photo not found for this user',
      });
    }
    
    // Update photo metadata
    const updatedPhoto = await prisma.photo.update({
      where: { id: photoId },
      data: {
        ...(latitude && { latitude: parseFloat(latitude) }),
        ...(longitude && { longitude: parseFloat(longitude) }),
        ...(takenAt && { takenAt: new Date(takenAt) }),
        updatedAt: new Date(),
      },
    });
    
    res.json({
      success: true,
      message: 'Photo metadata updated successfully',
      photo: updatedPhoto,
    });
    
  } catch (error) {
    console.error('Update photo metadata error:', error);
    res.status(500).json({
      error: 'Failed to update photo metadata',
      message: error.message,
    });
  }
};

/**
 * Get photo by ID
 */
const getPhotoById = async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;
    
    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        userId,
      },
      include: {
        journey: {
          select: {
            id: true,
            title: true,
            startTime: true,
          },
        },
      },
    });
    
    if (!photo) {
      return res.status(404).json({
        error: 'Photo not found',
        message: 'Photo not found for this user',
      });
    }
    
    res.json({
      success: true,
      photo,
    });
    
  } catch (error) {
    console.error('Get photo error:', error);
    res.status(500).json({
      error: 'Failed to get photo',
      message: error.message,
    });
  }
};

module.exports = {
  upload: upload.single('photo'),
  uploadPhoto,
  getJourneyPhotos,
  getUserPhotos,
  deletePhoto,
  updatePhotoMetadata,
  getPhotoById,
};