// Socket.io Configuration for Reliable Connections
// server/sockets/socketConfig.js

const logger = require('../services/Logger');

/**
 * Socket.io configuration for reliable connections and error handling
 */
const socketConfig = {
  // Enable CORS for all origins in development
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL 
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  
  // Connection settings for reliability
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  connectTimeout: 45000, // 45 seconds
  
  // Enable HTTP long-polling as fallback
  transports: ['websocket', 'polling'],
  
  // Allow reconnections with exponential backoff
  allowUpgrades: true,
  
  // Maximum reconnection attempts
  maxHttpBufferSize: 1e6, // 1MB
  
  // Enable compression
  perMessageDeflate: {
    threshold: 1024
  }
};

/**
 * Socket authentication middleware
 */
const authenticateSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!token) {
      logger.warn('Socket connection attempt without token', {
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
      return next(new Error('Authentication required'));
    }
    
    // Verify JWT token (you'll need to implement your auth logic here)
    // For now, we'll simulate authentication
    const decoded = { id: 'temp-user-id' }; // Replace with actual JWT verification
    
    socket.userId = decoded.id;
    socket.join(`user-${decoded.id}`);
    
    logger.info(`Socket authenticated for user ${decoded.id}`, {
      socketId: socket.id,
      userId: decoded.id
    });
    
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error);
    next(new Error('Authentication failed'));
  }
};

/**
 * Socket connection handler with error handling
 */
const handleConnection = (socket) => {
  logger.info(`User ${socket.userId} connected (Socket: ${socket.id})`);
  
  // Handle connection errors
  socket.on('error', (error) => {
    logger.error(`Socket error for user ${socket.userId}:`, error);
  });
  
  // Handle reconnection attempts
  socket.on('reconnect_attempt', (attemptNumber) => {
    logger.info(`User ${socket.userId} reconnection attempt ${attemptNumber}`);
  });
  
  // Handle successful reconnection
  socket.on('reconnect', (attemptNumber) => {
    logger.info(`User ${socket.userId} reconnected after ${attemptNumber} attempts`);
    
    // Rejoin rooms and restore state
    socket.join(`user-${socket.userId}`);
    
    // Emit reconnection event to client
    socket.emit('reconnected', {
      message: 'Successfully reconnected',
      timestamp: new Date().toISOString()
    });
  });
  
  // Handle disconnection with reason
  socket.on('disconnect', (reason) => {
    logger.info(`User ${socket.userId} disconnected: ${reason}`, {
      socketId: socket.id,
      userId: socket.userId,
      reason
    });
    
    // Clean up any temporary state
    if (socket.currentGroupId) {
      socket.leave(`group-${socket.currentGroupId}`);
    }
  });
  
  // Health check endpoint
  socket.on('ping', (data, callback) => {
    if (typeof callback === 'function') {
      callback({
        status: 'ok',
        timestamp: new Date().toISOString(),
        userId: socket.userId
      });
    }
  });
  
  // Send connection confirmation
  socket.emit('connected', {
    socketId: socket.id,
    userId: socket.userId,
    message: 'Successfully connected to server',
    timestamp: new Date().toISOString()
  });
};

/**
 * Socket middleware for rate limiting
 */
const rateLimitMiddleware = (socket, next) => {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const max = 100; // Max events per minute
  
  if (!socket.rateLimit) {
    socket.rateLimit = {
      count: 0,
      resetTime: now + windowMs
    };
  }
  
  // Reset counter if window has passed
  if (now > socket.rateLimit.resetTime) {
    socket.rateLimit.count = 0;
    socket.rateLimit.resetTime = now + windowMs;
  }
  
  // Check if rate limit exceeded
  if (socket.rateLimit.count >= max) {
    logger.warn(`Rate limit exceeded for user ${socket.userId}`, {
      socketId: socket.id,
      count: socket.rateLimit.count
    });
    
    socket.emit('rate_limit_exceeded', {
      message: 'Too many requests',
      retryAfter: Math.ceil((socket.rateLimit.resetTime - now) / 1000)
    });
    
    return next(new Error('Rate limit exceeded'));
  }
  
  socket.rateLimit.count++;
  next();
};

module.exports = {
  socketConfig,
  authenticateSocket,
  handleConnection,
  rateLimitMiddleware
};