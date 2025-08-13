// Validation Middleware
// server/middleware/validation.js

const { validationResult } = require('express-validator');
const { isValidCoordinate } = require('../utils/helpers');

/**
 * Generic validation error handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array(),
      message: 'Please check your input and try again',
    });
  }
  next();
};

/**
 * Validate GPS coordinates
 */
const validateCoordinates = (req, res, next) => {
  const { latitude, longitude } = req.body;
  
  if (latitude !== undefined || longitude !== undefined) {
    if (!isValidCoordinate(latitude, longitude)) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        message: 'Latitude must be between -90 and 90, longitude between -180 and 180',
      });
    }
  }
  
  next();
};

/**
 * Validate date ranges
 */
const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'Start date must be before end date',
      });
    }
    
    // Check if date range is too large (more than 2 years)
    const maxRange = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years in milliseconds
    if (end - start > maxRange) {
      return res.status(400).json({
        error: 'Date range too large',
        message: 'Date range cannot exceed 2 years',
      });
    }
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  let { page, limit } = req.query;
  
  // Set defaults
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 20;
  
  // Validate ranges
  if (page < 1) {
    return res.status(400).json({
      error: 'Invalid pagination',
      message: 'Page must be a positive integer',
    });
  }
  
  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      error: 'Invalid pagination',
      message: 'Limit must be between 1 and 100',
    });
  }
  
  // Update query with validated values
  req.query.page = page;
  req.query.limit = limit;
  
  next();
};

/**
 * Sanitize file upload
 */
const validateFileUpload = (fileTypes = ['image/jpeg', 'image/png', 'image/webp'], maxSize = 10 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a file',
      });
    }
    
    // Check file type
    if (!fileTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: `Only ${fileTypes.join(', ')} files are allowed`,
      });
    }
    
    // Check file size
    if (req.file.size > maxSize) {
      return res.status(400).json({
        error: 'File too large',
        message: `File size must not exceed ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
    }
    
    next();
  };
};

/**
 * Validate group code format
 */
const validateGroupCode = (req, res, next) => {
  const { code } = req.body;
  
  if (code) {
    // Group codes should be 6 uppercase alphanumeric characters
    const codePattern = /^[A-Z0-9]{6}$/;
    if (!codePattern.test(code)) {
      return res.status(400).json({
        error: 'Invalid group code',
        message: 'Group code must be exactly 6 uppercase alphanumeric characters',
      });
    }
  }
  
  next();
};

/**
 * Validate journey status transitions
 */
const validateJourneyStatus = (req, res, next) => {
  const { status } = req.body;
  
  if (status) {
    const validStatuses = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid journey status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }
  }
  
  next();
};

/**
 * Validate speed values
 */
const validateSpeed = (req, res, next) => {
  const { speed, topSpeed, avgSpeed } = req.body;
  
  const speeds = [speed, topSpeed, avgSpeed].filter(s => s !== undefined);
  
  for (const speedValue of speeds) {
    if (typeof speedValue !== 'number' || speedValue < 0 || speedValue > 500) {
      return res.status(400).json({
        error: 'Invalid speed',
        message: 'Speed values must be numbers between 0 and 500 km/h',
      });
    }
  }
  
  next();
};

/**
 * Validate vehicle type
 */
const validateVehicle = (req, res, next) => {
  const { vehicle } = req.body;
  
  if (vehicle) {
    const validVehicles = ['bike', 'car', 'truck', 'motorcycle', 'bus', 'other'];
    if (!validVehicles.includes(vehicle)) {
      return res.status(400).json({
        error: 'Invalid vehicle type',
        message: `Vehicle must be one of: ${validVehicles.join(', ')}`,
      });
    }
  }
  
  next();
};

/**
 * Rate limiting validation helper
 */
const validateRateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userKey = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [key, timestamps] of requests.entries()) {
      requests.set(key, timestamps.filter(time => time > windowStart));
      if (requests.get(key).length === 0) {
        requests.delete(key);
      }
    }
    
    // Check current user's requests
    const userRequests = requests.get(userKey) || [];
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    }
    
    // Add current request
    userRequests.push(now);
    requests.set(userKey, userRequests);
    
    next();
  };
};

/**
 * Sanitize input strings
 */
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    // Remove potential XSS and script tags
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };
  
  // Recursively sanitize request body
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeString(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    }
  };
  
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  next();
};

/**
 * Validate UUID parameters
 */
const validateUUID = (paramNames = []) => {
  return (req, res, next) => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    for (const paramName of paramNames) {
      const value = req.params[paramName];
      if (value && !uuidPattern.test(value)) {
        return res.status(400).json({
          error: 'Invalid ID format',
          message: `${paramName} must be a valid UUID`,
        });
      }
    }
    
    next();
  };
};

/**
 * Validate required fields
 */
const validateRequired = (fields = []) => {
  return (req, res, next) => {
    const missing = [];
    
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: `The following fields are required: ${missing.join(', ')}`,
        missing,
      });
    }
    
    next();
  };
};

module.exports = {
  handleValidationErrors,
  validateCoordinates,
  validateDateRange,
  validatePagination,
  validateFileUpload,
  validateGroupCode,
  validateJourneyStatus,
  validateSpeed,
  validateVehicle,
  validateRateLimit,
  sanitizeInput,
  validateUUID,
  validateRequired,
};