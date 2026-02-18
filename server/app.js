// server/app.js 

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const prisma = require('./prisma/client');
require('dotenv').config();

// Import enhanced services
const logger = require('./services/Logger');
const healthService = require('./services/HealthService');
const { cacheService } = require('./services/CacheService');
const sentryService = require('./services/SentryService');

// Import routes
const authRoutes = require('./routes/auth');
const journeyRoutes = require('./routes/journey');
const galleryRoutes = require('./routes/gallery');
const leaderboardRoutes = require('./routes/leaderboard');
const groupRoutes = require('./routes/group');
const userRoutes = require('./routes/user');
const mapsRoutes = require('./routes/maps');
const groupJourneyRoutes = require('./routes/groupJourney');

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

const { requireOperator } = require('./middleware/authorization');

// Prisma Client initialized via singleton (with logging)

const app = express();

// Trust proxy for accurate client IP
app.set('trust proxy', 1);

// Sentry request and tracing handlers (must be first)
app.use(sentryService.getRequestHandler());
app.use(sentryService.getTracingHandler());

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
    // In development, allow all origins to simplify mobile/LAN testing
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      return callback(null, true);
    }

    const allowedOrigins = [process.env.FRONTEND_URL];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some(allowed => allowed && allowed === origin);
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
// Development mode: very generous limits; Production: stricter but still reasonable
const isDev = process.env.NODE_ENV !== 'production';
// User requested to decrease limit wait time to 10 secs and increase limits significantly
const window10s = 10 * 1000;

app.use('/api/auth', createRateLimit(window10s, isDev ? 50 : 20, 'Too many authentication attempts'));
app.use('/api/maps', createRateLimit(window10s, isDev ? 200 : 100, 'Too many map requests'));
app.use('/api/gallery', createRateLimit(window10s, isDev ? 100 : 50, 'Too many gallery requests'));
// Allow very high throughput for real-time tracking endpoints
app.use('/api/journey', createRateLimit(window10s, isDev ? 500 : 300, 'Too many journey updates'));
app.use('/api/group-journey', createRateLimit(window10s, isDev ? 500 : 300, 'Too many group journey requests'));
app.use('/api/group', createRateLimit(window10s, isDev ? 200 : 100, 'Too many group requests'));
app.use('/api/user', createRateLimit(window10s, isDev ? 100 : 50, 'Too many user requests'));
app.use('/api/leaderboard', createRateLimit(window10s, isDev ? 100 : 50, 'Too many leaderboard requests'));
// Default catch-all
app.use('/api', createRateLimit(window10s, isDev ? 100 : 50, 'Too many requests'));

// Body parsing middleware with enhanced validation
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Skip validation for empty bodies (e.g. POST with no payload)
    if (!buf || buf.length === 0) return;
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

// Serve uploaded files statically
const path = require('path');
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
}));
logger.info('Static file serving enabled for /uploads directory');

// Global middleware
app.use(sanitizeInput);
app.use(securityLogger);
app.use(performanceMonitor);
app.use(apiLogger);

// Friendly root route to help with quick manual checks
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Wayfarian API is running',
    tips: 'Use /health for a quick check or /api for available endpoints',
    endpoints: {
      health: '/health',
      api: '/api',
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Health check endpoints with caching
app.get('/health', cacheHealth(30), (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Wayfarian API',
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    // Advertise the production base URL so clients can adopt it automatically
    publicBaseUrl: 'https://wayfarian-system-production.up.railway.app',
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
app.use('/api/group-journey', authMiddleware, groupJourneyRoutes);
app.use('/api/gallery', authMiddleware, galleryRoutes);
app.use('/api/leaderboard', authMiddleware, cacheLeaderboard(600), leaderboardRoutes);
app.use('/api/group', authMiddleware, groupRoutes);
app.use('/api/user', authMiddleware, userRoutes);

// Allow maps endpoints without database-backed auth so the app works offline/while DB is unavailable.
// Also allows unauthenticated users (e.g. during registration) to use location search.
app.use('/api/maps', cacheMaps(1800), mapsRoutes);
app.use('/api/places', cacheMaps(1800), mapsRoutes);

// System and admin endpoints
app.get('/api/system/status', authMiddleware, requireOperator, (req, res) => {
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

app.get('/api/system/cache/stats', authMiddleware, requireOperator, getCacheStats);
app.delete('/api/system/cache', authMiddleware, requireOperator, clearCache);

app.get('/api/system/logs/stats', authMiddleware, requireOperator, (req, res) => {
  const metrics = logger.getMetrics();
  const logFiles = logger.getLogFiles();
  
  res.json({
    success: true,
    metrics,
    logFiles,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/system/jobs/stats', authMiddleware, requireOperator, (req, res) => {
  const { jobQueue } = require('./services/JobQueue');
  const stats = jobQueue.getStats();
  
  res.json({
    success: true,
    jobQueue: stats,
    timestamp: new Date().toISOString(),
  });
});

// Database connection test endpoint
app.get('/api/system/database', authMiddleware, requireOperator, async (req, res) => {
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
app.get('/api/system/metrics', authMiddleware, requireOperator, (req, res) => {
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

// Storage status endpoint to help diagnose storage setup
app.get('/api/system/storage', authMiddleware, requireOperator, (req, res) => {
  try {
    const fb = require('./services/Firebase');
    const { cloudinaryInitialized } = require('./services/CloudinaryService');
    
    res.json({
      success: true,
      storage: {
        cloudinary: {
          initialized: cloudinaryInitialized,
          configured: !!process.env.CLOUDINARY_URL,
          status: cloudinaryInitialized ? 'active' : 'not configured',
        },
        firebase: {
          initialized: fb.firebaseInitialized === true,
          storageAvailable: fb.storageAvailable === true,
          configured: !!process.env.FIREBASE_STORAGE_BUCKET,
          status: fb.storageAvailable ? 'active' : fb.firebaseInitialized ? 'initialized but bucket unavailable' : 'not configured',
        },
        local: {
          available: true,
          status: 'fallback',
        },
        priority: cloudinaryInitialized ? 'Cloudinary' : fb.storageAvailable ? 'Firebase' : 'Local',
      },
      requires: {
        CLOUDINARY_URL: !!process.env.CLOUDINARY_URL,
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
        FIREBASE_STORAGE_BUCKET: !!process.env.FIREBASE_STORAGE_BUCKET,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use(errorLogger);

// Sentry error handler (must be before other error handlers)
app.use(sentryService.getErrorHandler());

app.use((err, req, res, next) => {
  // Capture error in Sentry with context
  sentryService.captureException(err, {
    tags: {
      errorName: err.name,
      errorCode: err.code,
      route: req.path,
      method: req.method,
    },
    extra: {
      requestId: req.id,
      userId: req.user?.id,
      ip: req.ip,
    },
    user: req.user ? {
      id: req.user.id,
      email: req.user.email,
      username: req.user.displayName,
    } : undefined,
  });

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
  
  // Default error response - never expose internal details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'Something went wrong. Please try again later.',
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString(),
    // Only include stack trace in development
    ...(isDevelopment && { stack: err.stack }),
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
