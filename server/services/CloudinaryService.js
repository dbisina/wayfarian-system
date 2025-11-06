// Cloudinary service for file uploads
const cloudinary = require('cloudinary').v2;

// Initialize Cloudinary
let cloudinaryInitialized = false;

try {
  if (process.env.CLOUDINARY_URL) {
    // Cloudinary automatically configures from CLOUDINARY_URL
    cloudinaryInitialized = true;
    console.log('[Cloudinary] Initialized successfully');
    console.log('[Cloudinary] Cloud name:', cloudinary.config().cloud_name);
  } else {
    console.warn('[Cloudinary] CLOUDINARY_URL not found in environment variables');
  }
} catch (error) {
  console.error('[Cloudinary] Initialization failed:', error.message);
}

/**
 * Upload file to Cloudinary
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name (used for public_id)
 * @param {string} folder - Cloudinary folder (e.g., 'profile-pictures')
 * @param {object} options - Additional Cloudinary options
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadToCloudinary(fileBuffer, fileName, folder = 'uploads', options = {}) {
  if (!cloudinaryInitialized) {
    throw new Error('Cloudinary is not initialized. Please set CLOUDINARY_URL environment variable.');
  }

  return new Promise((resolve, reject) => {
    // Create upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `wayfarian/${folder}`, // Prefix with app name to organize
        public_id: fileName.split('.')[0], // Use filename without extension
        resource_type: 'auto', // Auto-detect resource type
        overwrite: true,
        ...options,
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload failed:', {
            folder,
            fileName,
            error: error.message,
          });
          reject(error);
        } else {
          console.log('[Cloudinary] Upload successful:', {
            folder,
            fileName,
            url: result.secure_url,
            size: result.bytes,
          });
          resolve(result.secure_url);
        }
      }
    );

    // Write buffer to stream
    uploadStream.end(fileBuffer);
  });
}

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public_id (e.g., 'wayfarian/profile-pictures/filename')
 * @returns {Promise<void>}
 */
async function deleteFromCloudinary(publicId) {
  if (!cloudinaryInitialized) {
    console.warn('[Cloudinary] Not initialized, cannot delete file');
    return;
  }

  try {
    // Extract public_id from URL if full URL was provided
    let id = publicId;
    if (publicId.includes('cloudinary.com')) {
      // Extract public_id from Cloudinary URL
      const matches = publicId.match(/\/v\d+\/(.+)\.\w+$/);
      if (matches) {
        id = matches[1];
      }
    }

    const result = await cloudinary.uploader.destroy(id);
    console.log('[Cloudinary] Delete result:', { publicId: id, result: result.result });
  } catch (error) {
    console.error('[Cloudinary] Delete failed:', {
      publicId,
      error: error.message,
    });
  }
}

/**
 * Generate optimized image URL with transformations
 * @param {string} publicId - Cloudinary public_id
 * @param {object} transformations - Cloudinary transformations
 * @returns {string} - Transformed image URL
 */
function getOptimizedUrl(publicId, transformations = {}) {
  if (!cloudinaryInitialized) {
    return publicId; // Return original if Cloudinary not available
  }

  return cloudinary.url(publicId, {
    secure: true,
    ...transformations,
  });
}

/**
 * Generate thumbnail URL
 * @param {string} url - Original Cloudinary URL
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {string} - Thumbnail URL
 */
function getThumbnailUrl(url, width = 300, height = 300) {
  if (!cloudinaryInitialized || !url.includes('cloudinary.com')) {
    return url;
  }

  // Extract public_id from URL
  const matches = url.match(/\/v\d+\/(.+)\.\w+$/);
  if (!matches) return url;

  const publicId = matches[1];
  return cloudinary.url(publicId, {
    secure: true,
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    fetch_format: 'auto',
  });
}

module.exports = {
  cloudinary,
  cloudinaryInitialized,
  uploadToCloudinary,
  deleteFromCloudinary,
  getOptimizedUrl,
  getThumbnailUrl,
};
