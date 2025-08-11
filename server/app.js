// server/app.js

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

// Import middleware
const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Wayfarian API'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/journey', authMiddleware, journeyRoutes);
app.use('/api/gallery', authMiddleware, galleryRoutes);
app.use('/api/leaderboard', authMiddleware, leaderboardRoutes);
app.use('/api/group', authMiddleware, groupRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
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
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;

// server/index.js - Server entry point with Socket.io

const http = require('http');
const socketIo = require('socket.io');
const app = require('./app');

// Import socket handlers
const groupSocket = require('./sockets/groupSocket');
const journeySocket = require('./sockets/journeySocket');

const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL 
      : ['http://localhost:3000', 'http://localhost:19006'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    const { verifyIdToken } = require('./services/Firebase');
    const decodedToken = await verifyIdToken(token);
    socket.userId = decodedToken.uid;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId}`);
  
  // Initialize socket handlers
  groupSocket(io, socket);
  journeySocket(io, socket);
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Wayfarian API Server running on port ${PORT}`);
  console.log(`📡 Socket.io server ready`);
});

// Export for testing
module.exports = { app, server, io };