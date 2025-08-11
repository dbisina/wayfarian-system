// Validation Middleware
// server/middleware/validation.js

const { validationResult } = require('express-validator');

/**
 * Standard validation error handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));
    
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid input data',
      errors: extractedErrors
    });
  }
  
  next();
};

/**
 * Sanitize input middleware
 */
const sanitizeInput = (req, res, next) => {
  // Recursively clean input data
  const clean = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      if (typeof obj === 'string') {
        return obj.trim();
      }
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(clean);
    }
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = clean(value);
    }
    return cleaned;
  };
  
  if (req.body) {
    req.body = clean(req.body);
  }
  
  if (req.query) {
    req.query = clean(req.query);
  }
  
  if (req.params) {
    req.params = clean(req.params);
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (maxLimit = 100) => {
  return (req, res, next) => {
    const { page = 1, limit = 20 } = req.query;
    
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({
        error: 'Invalid pagination',
        message: 'Page must be a positive integer'
      });
    }
    
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > maxLimit) {
      return res.status(400).json({
        error: 'Invalid pagination',
        message: `Limit must be between 1 and ${maxLimit}`
      });
    }
    
    req.pagination = {
      page: parsedPage,
      limit: parsedLimit,
      skip: (parsedPage - 1) * parsedLimit
    };
    
    next();
  };
};

/**
 * Validate coordinates
 */
const validateCoordinates = (req, res, next) => {
  const { latitude, longitude } = req.body;
  
  if (latitude !== undefined) {
    const lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        message: 'Latitude must be between -90 and 90'
      });
    }
    req.body.latitude = lat;
  }
  
  if (longitude !== undefined) {
    const lng = parseFloat(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        message: 'Longitude must be between -180 and 180'
      });
    }
    req.body.longitude = lng;
  }
  
  next();
};

/**
 * Validate date range
 */
const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({
        error: 'Invalid date',
        message: 'Invalid start date format'
      });
    }
    req.query.startDate = start;
  }
  
  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date',
        message: 'Invalid end date format'
      });
    }
    req.query.endDate = end;
  }
  
  if (startDate && endDate && req.query.startDate > req.query.endDate) {
    return res.status(400).json({
      error: 'Invalid date range',
      message: 'Start date must be before end date'
    });
  }
  
  next();
};

/**
 * Validate file upload
 */
const validateFileUpload = (allowedTypes = ['image/jpeg', 'image/png', 'image/gif']) => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a file'
      });
    }
    
    const files = req.files || [req.file];
    
    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          message: `Allowed file types: ${allowedTypes.join(', ')}`
        });
      }
    }
    
    next();
  };
};

/**
 * Rate limiting per user
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();
    
    const now = Date.now();
    const userRequests = requests.get(userId) || [];
    
    // Clean old requests
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please try again later'
      });
    }
    
    validRequests.push(now);
    requests.set(userId, validRequests);
    
    next();
  };
};

module.exports = {
  handleValidationErrors,
  sanitizeInput,
  validatePagination,
  validateCoordinates,
  validateDateRange,
  validateFileUpload,
  userRateLimit
};