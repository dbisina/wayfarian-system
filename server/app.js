// server/app.js 

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Import enhanced services
const logger = require('./services/Logger');
const healthService = require('./services/HealthService');
const { cacheService } = require('./services/CacheService');

// Import routes
const authRoutes = require('./routes/auth');
const journeyRoutes = require('./routes/journey');
const galleryRoutes = require('./routes/gallery');
const leaderboardRoutes = require('./routes/leaderboard');
const groupRoutes = require('./routes/group');
const userRoutes = require('./routes/user');
const mapsRoutes = require('./routes/maps');

// Import middleware
const authMiddleware = require('./middleware/auth');
const { 
  sanitizeInput, 
  validatePagination,
  handleValidationErrors 
} = require('./middleware/validation');

const {
  apiLogger,
  authLogger,
  userActionLogger,
  securityLogger,
  errorLogger,
  performanceMonitor,
  dbLogger,
} = require('./middleware/logging');

const {
  cacheMiddleware,
  cacheLeaderboard,
  cacheUserProfile,
  cacheMaps,
  cacheGallery,
  cacheHealth,
  getCacheStats,
  clearCache,
} = require('./middleware/cache');

// Initialize Prisma Client with logging
const prisma = dbLogger.wrapPrisma(new PrismaClient());

const app = express();

// Trust proxy for accurate client IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
    },
  },
}));

// Enhanced CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL]
      : [
          'http://localhost:3000', 
          'http://localhost:19006', 
          'http://localhost:8081',
          'exp://192.168.1.100:19000',
          /^https:\/\/.*\.vercel\.app$/,
          /^https:\/\/.*\.netlify\.app$/,
        ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.security('CORS violation', { origin, userAgent: 'N/A' });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['X-Cache', 'X-Cache-Key'],
}));

// Enhanced rate limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    error: 'Too many requests',
    message,
    retryAfter: Math.ceil(windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.security('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      userId: req.user?.id,
    });
    res.status(429).json({
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    });
  },
});

// Different rate limits for different endpoints
app.use('/api/auth', createRateLimit(15 * 60 * 1000, 20, 'Too many authentication attempts'));
app.use('/api/maps', createRateLimit(15 * 60 * 1000, 200, 'Too many map requests'));
app.use('/api/gallery', createRateLimit(15 * 60 * 1000, 50, 'Too many gallery requests'));
app.use('/api', createRateLimit(15 * 60 * 1000, 100, 'Too many requests'));

// Body parsing middleware with enhanced validation
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      logger.security('Invalid JSON received', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        error: e.message,
      });
      res.status(400).json({
        error: 'Invalid JSON',
        message: 'Request body contains invalid JSON',
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Global middleware
app.use(sanitizeInput);
app.use(securityLogger);
app.use(performanceMonitor);
app.use(apiLogger);

// Health check endpoints with caching
app.get('/health', cacheHealth(30), (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Wayfarian API',
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/health/detailed', authMiddleware, async (req, res) => {
  try {
    const healthReport = await healthService.runAllChecks();
    res.status(healthReport.status === 'healthy' ? 200 : 503).json(healthReport);
  } catch (error) {
    logger.error('Detailed health check failed', { error: error.message });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

app.get('/health/component/:component', authMiddleware, async (req, res) => {
  try {
    const { component } = req.params;
    const componentHealth = await healthService.checkComponent(component);
    res.status(componentHealth.status === 'healthy' ? 200 : 503).json(componentHealth);
  } catch (error) {
    res.status(404).json({
      error: 'Component not found',
      message: error.message,
    });
  }
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Wayfarian API v1.0.0',
    documentation: 'https://api.wayfarian.app/docs',
    endpoints: {
      auth: '/api/auth',
      journey: '/api/journey', 
      gallery: '/api/gallery',
      leaderboard: '/api/leaderboard',
      group: '/api/group',
      user: '/api/user',
      maps: '/api/maps',
      system: '/api/system',
    },
    features: [
      'Real-time journey tracking',
      'Group journeys with live location sharing',
      'Photo gallery with automatic processing',
      'Global and local leaderboards',
      'Maps integration with nearby places',
      'Comprehensive health monitoring',
    ],
    status: 'active',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes with caching where appropriate
app.use('/api/journey', authMiddleware, journeyRoutes);
app.use('/api/gallery', authMiddleware, galleryRoutes);
app.use('/api/leaderboard', authMiddleware, cacheLeaderboard(600), leaderboardRoutes);
app.use('/api/group', authMiddleware, groupRoutes);
app.use('/api/user', authMiddleware, userRoutes);
app.use('/api/maps', authMiddleware, cacheMaps(1800), mapsRoutes);
app.use('/api/places', authMiddleware, cacheMaps(1800), mapsRoutes);

// System and admin endpoints
app.get('/api/system/status', authMiddleware, (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.json({
    success: true,
    system: {
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/system/cache/stats', authMiddleware, getCacheStats);
app.delete('/api/system/cache', authMiddleware, clearCache);

app.get('/api/system/logs/stats', authMiddleware, (req, res) => {
  const metrics = logger.getMetrics();
  const logFiles = logger.getLogFiles();
  
  res.json({
    success: true,
    metrics,
    logFiles,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/system/jobs/stats', authMiddleware, (req, res) => {
  const { jobQueue } = require('./services/JobQueue');
  const stats = jobQueue.getStats();
  
  res.json({
    success: true,
    jobQueue: stats,
    timestamp: new Date().toISOString(),
  });
});

// Database connection test endpoint
app.get('/api/system/database', authMiddleware, async (req, res) => {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;
    
    // Get basic database stats
    const [userCount, journeyCount, groupCount, photoCount] = await Promise.all([
      prisma.user.count(),
      prisma.journey.count(),
      prisma.group.count(),
      prisma.photo.count(),
    ]);
    
    res.json({
      status: 'connected',
      message: 'Database connection is healthy',
      responseTime,
      stats: {
        users: userCount,
        journeys: journeyCount,
        groups: groupCount,
        photos: photoCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'production' ? 'Internal error' : error.message,
    });
  }
});

// API metrics endpoint
app.get('/api/system/metrics', authMiddleware, (req, res) => {
  const metrics = logger.getMetrics();
  const cacheStats = cacheService.getStats();
  const { jobQueue } = require('./services/JobQueue');
  const jobStats = jobQueue.getStats();
  
  res.json({
    success: true,
    metrics: {
      api: metrics,
      cache: cacheStats,
      jobs: jobStats,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(errorLogger);

app.use((err, req, res, next) => {
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
  
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: 'File Upload Error',
      message: err.message,
    });
  }
  
  if (err.code === 'P2002') { // Prisma unique constraint error
    return res.status(409).json({
      error: 'Conflict',
      message: 'A record with this information already exists',
    });
  }
  
  if (err.code === 'P2025') { // Prisma record not found
    return res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
    });
  }
  
  // Default error response
  const isDevelopment = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  logger.info('404 - Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
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
});

// Graceful shutdown handlers
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  gracefulShutdown();
});

module.exports = app;
