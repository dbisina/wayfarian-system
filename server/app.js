// server/app.js - Updated with all routes

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Initialize Prisma Client
const prisma = new PrismaClient();

// Import routes
const authRoutes = require('./routes/auth');
const journeyRoutes = require('./routes/journey');
const galleryRoutes = require('./routes/gallery');
const leaderboardRoutes = require('./routes/leaderboard');
const groupRoutes = require('./routes/group');
const userRoutes = require('./routes/user');

// Import middleware
const authMiddleware = require('./middleware/auth');
const { 
  sanitizeInput, 
  validatePagination,
  handleValidationErrors 
} = require('./middleware/validation');

const app = express();

// Trust proxy for accurate client IP (important for rate limiting)
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
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL]
    : [
        'http://localhost:3000', 
        'http://localhost:19006', 
        'http://localhost:8081',
        'exp://192.168.1.100:19000', // Add your local IP for Expo
      ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting - More lenient for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60, // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
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

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Wayfarian API',
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
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
    },
    status: 'active',
    version: '1.0.0',
  });
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes (authentication required)
app.use('/api/journey', authMiddleware, journeyRoutes);
app.use('/api/gallery', authMiddleware, galleryRoutes);
app.use('/api/leaderboard', authMiddleware, leaderboardRoutes);
app.use('/api/group', authMiddleware, groupRoutes);
app.use('/api/user', authMiddleware, userRoutes);

// Database connection test endpoint
app.get('/api/db-status', authMiddleware, async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'connected',
      message: 'Database connection is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'production' ? 'Internal error' : error.message,
    });
  }
});

// Socket.io status endpoint
app.get('/api/socket-status', (req, res) => {
  res.json({
    status: 'available',
    message: 'Socket.io server is configured',
    endpoint: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
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
  
  // Default error response
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
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
    },
  });
});

// Graceful shutdown handlers
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  try {
    await prisma.$disconnect();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

module.exports = app;