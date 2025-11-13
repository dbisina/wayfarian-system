// File Upload Security Utilities
// server/utils/fileSecurity.js

const sharp = require('sharp');
const logger = require('../services/Logger');

// Allowed MIME types and their corresponding file signatures
const ALLOWED_MIME_TYPES = {
  'image/jpeg': { signature: [0xFF, 0xD8, 0xFF], extensions: ['.jpg', '.jpeg'] },
  'image/png': { signature: [0x89, 0x50, 0x4E, 0x47], extensions: ['.png'] },
  'image/webp': { signature: [0x52, 0x49, 0x46, 0x46], extensions: ['.webp'] },
  'image/gif': { signature: [0x47, 0x49, 0x46, 0x38], extensions: ['.gif'] }
};

// Dangerous file patterns
const DANGEROUS_PATTERNS = [
  /<\.?(php|exe|bat|cmd|sh|js|html|htm|phtml|phar|htaccess|env|config)/i,
  /\x00/, // Null bytes
  /\x04/, // End of transmission
  /\x1A/, // Substitute character
];

/**
 * Validate file signature against MIME type
 */
const validateFileSignature = (buffer, mimeType) => {
  const signature = ALLOWED_MIME_TYPES[mimeType]?.signature;
  if (!signature) return false;
  
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }
  
  return true;
};

/**
 * Check for dangerous patterns in filename
 */
const validateFilename = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(filename)) {
      return false;
    }
  }
  
  // Check for path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Check length
  if (filename.length > 255) {
    return false;
  }
  
  return true;
};

/**
 * Sanitize image to remove potential malicious content
 */
const sanitizeImage = async (buffer, options = {}) => {
  const {
    maxWidth = 5000,
    maxHeight = 5000,
    quality = 85,
    format = 'jpeg'
  } = options;
  
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Validate image dimensions
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      throw new Error(`Image dimensions too large: ${metadata.width}x${metadata.height}`);
    }
    
    // Reprocess image to remove potential malicious content
    const sanitizedBuffer = await image
      .resize({
        width: Math.min(metadata.width, maxWidth),
        height: Math.min(metadata.height, maxHeight),
        fit: 'inside',
        withoutEnlargement: true
      })
      [format]({ 
        quality,
        progressive: true,
        force: true // Force output format
      })
      .toBuffer();
    
    return {
      buffer: sanitizedBuffer,
      format: format,
      mimeType: `image/${format}`,
      width: Math.min(metadata.width, maxWidth),
      height: Math.min(metadata.height, maxHeight)
    };
  } catch (error) {
    logger.error('Image sanitization failed', { error: error.message });
    throw new Error('Failed to process image');
  }
};

/**
 * Comprehensive file validation
 */
const validateFileUpload = (file, options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedMimeTypes = Object.keys(ALLOWED_MIME_TYPES),
    requireImageSanitization = true
  } = options;
  
  const validationErrors = [];
  
  // Check file exists
  if (!file || !file.buffer) {
    validationErrors.push('No file provided');
    return { isValid: false, errors: validationErrors };
  }
  
  // Check file size
  if (file.size > maxSize) {
    validationErrors.push(`File size ${file.size} exceeds maximum ${maxSize}`);
  }
  
  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    validationErrors.push(`MIME type ${file.mimetype} not allowed`);
  }
  
  // Validate filename
  if (!validateFilename(file.originalname)) {
    validationErrors.push('Invalid filename');
  }
  
  // Validate file signature
  if (file.mimetype && ALLOWED_MIME_TYPES[file.mimetype]) {
    if (!validateFileSignature(file.buffer, file.mimetype)) {
      validationErrors.push('File signature does not match MIME type');
    }
  }
  
  // Check for suspicious content in first few bytes
  const header = file.buffer.slice(0, 100).toString('utf8', 0, 100);
  if (header.includes('<?php') || header.includes('<script')) {
    validationErrors.push('Suspicious content detected in file header');
  }
  
  return {
    isValid: validationErrors.length === 0,
    errors: validationErrors,
    requiresSanitization: requireImageSanitization && file.mimetype?.startsWith('image/')
  };
};

/**
 * Generate secure filename
 */
const generateSecureFilename = (originalName, userId, prefix = 'file') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  
  // Get safe extension from original name
  const extension = originalName ? 
    '.' + originalName.split('.').pop().toLowerCase() : 
    '.jpg';
  
  // Validate extension
  const allowedExtensions = Object.values(ALLOWED_MIME_TYPES)
    .flatMap(mime => mime.extensions);
  
  const safeExtension = allowedExtensions.includes(extension) ? extension : '.jpg';
  
  return `${prefix}_${userId}_${timestamp}_${random}${safeExtension}`;
};

/**
 * Log file upload security events
 */
const logSecurityEvent = (event, details) => {
  logger.security(`File upload ${event}`, details);
};

module.exports = {
  validateFileUpload,
  sanitizeImage,
  generateSecureFilename,
  validateFilename,
  validateFileSignature,
  logSecurityEvent,
  ALLOWED_MIME_TYPES,
  DANGEROUS_PATTERNS
};