// Comprehensive Error Handling Middleware
// server/middleware/errorHandler.js

const logger = require('../services/Logger');

class ErrorHandler {
  /**
   * Global error handler middleware
   */
  static handleError(err, req, res, next) {
    // Check if headers have already been sent
    if (res.headersSent) {
      logger.warn('Headers already sent, cannot send error response', {
        method: req.method,
        url: req.url,
        error: err.message,
        stack: err.stack
      });
      return next(err);
    }

    // Log the error
    logger.error('Request error', {
      message: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: err.message,
        details: err.details
      });
    }

    if (err.name === 'UnauthorizedError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    if (err.name === 'MulterError') {
      return res.status(400).json({
        error: 'File Upload Error',
        message: err.message
      });
    }

    if (err.code === 'P2002') { // Prisma unique constraint error
      return res.status(409).json({
        error: 'Conflict',
        message: 'A record with this information already exists'
      });
    }

    if (err.code === 'P2025') { // Prisma record not found
      return res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found'
      });
    }

    if (err.message === 'Invalid JSON') {
      return res.status(400).json({
        error: 'Invalid JSON',
        message: 'Request body contains invalid JSON'
      });
    }

    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({
        error: 'CORS Error',
        message: 'Origin not allowed'
      });
    }

    // Handle socket-related errors
    if (err.message.includes('socket') || err.message.includes('transport')) {
      return res.status(503).json({
        error: 'Connection Error',
        message: 'Real-time connection issue. Please try reconnecting.'
      });
    }

    // Default error response
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: isDevelopment ? err.message : 'Something went wrong. Please try again later.',
      requestId: req.id || 'unknown',
      timestamp: new Date().toISOString(),
      // Only include stack trace in development
      ...(isDevelopment && { stack: err.stack }),
    });
  }

  /**
   * Async error wrapper for controllers
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Socket error handler
   */
  static handleSocketError(socket, error) {
    logger.error('Socket error', {
      socketId: socket.id,
      userId: socket.userId,
      error: error.message,
      stack: error.stack
    });

    // Send error to client
    socket.emit('error', {
      type: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Database connection error handler
   */
  static handleDatabaseError(error) {
    logger.error('Database error', {
      error: error.message,
      code: error.code,
      meta: error.meta
    });

    // Implement retry logic or fallback strategies here
    if (error.code === 'P1001') { // Cannot reach database server
      // Implement fallback to cache or queue system
      logger.warn('Database unreachable, implementing fallback strategy');
    }
  }

  /**
   * Rate limiting error handler
   */
  static handleRateLimitError(req, res) {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      userId: req.user?.id
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60 // seconds
    });
  }

  /**
   * 404 handler for unmatched routes
   */
  static handleNotFound(req, res) {
    logger.info('404 - Route not found', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(404).json({
      error: 'Not Found',
      message: `The requested resource ${req.method} ${req.originalUrl} was not found`,
      availableEndpoints: {
        health: 'GET /health',
        api: 'GET /api',
        auth: 'POST /api/auth/login',
        journey: 'GET /api/journey/active',
        gallery: 'GET /api/gallery/photos',
        leaderboard: 'GET /api/leaderboard/global',
        group: 'GET /api/group/my-groups',
        user: 'GET /api/user/profile',
        maps: 'GET /api/maps/nearby-places',
        system: 'GET /api/system/status',
      },
    });
  }

  /**
   * Graceful shutdown handler
   */
  static async gracefulShutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Close database connections
      const prisma = require('../prisma/client');
      await prisma.$disconnect();
      logger.info('Database connection closed');
      
      // Close Redis connections
      const redisService = require('../services/RedisService');
      await redisService.disconnect();
      logger.info('Redis connection closed');
      
      // Exit process
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Setup global error handlers
   */
  static setupGlobalHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { 
        error: error.message, 
        stack: error.stack 
      });
      this.gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      this.gracefulShutdown('unhandledRejection');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.gracefulShutdown('SIGINT');
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.gracefulShutdown('SIGTERM');
    });
  }
}

module.exports = ErrorHandler;