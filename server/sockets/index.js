// server/sockets/index.js - Socket.io Server Setup

const { Server } = require('socket.io');
const { verifyIdToken } = require('../services/Firebase');
const prisma = require('../prisma/client');
const journeySocket = require('./journeySocket');
const groupSocket = require('./groupSockets');
const groupJourneySocket = require('./groupJourneySocket');

// Use shared Prisma client

/**
 * Initialize Socket.io server with authentication
 * @param {object} server - HTTP server instance
 * @returns {object} Socket.io instance
 */
const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL]
        : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify Firebase token
      const decodedToken = await verifyIdToken(token);
      
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        select: {
          id: true,
          displayName: true,
          photoURL: true,
          email: true,
        },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Attach user info to socket
      socket.userId = user.id;
      socket.userInfo = user;
      socket.firebaseUid = decodedToken.uid;

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handling
  io.on('connection', (socket) => {
    console.log(`User ${socket.userInfo.displayName} connected (Socket: ${socket.id})`);

    // Join user-specific room
    socket.join(`user-${socket.userId}`);

    // Send connection confirmation
    socket.emit('connected', {
      message: 'Successfully connected to Wayfarian',
      user: socket.userInfo,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Initialize feature handlers
    journeySocket(io, socket);
    groupSocket(io, socket);
    groupJourneySocket(io, socket);

    // Handle heartbeat
    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack', {
        timestamp: new Date().toISOString(),
      });
    });

    // Handle user status updates
    socket.on('update-status', async (data) => {
      try {
        const { status, location } = data;
        
        // Update user's online status in active groups
        if (location && socket.currentGroupId && typeof socket.currentGroupId === 'string') {
          await prisma.groupMember.update({
            where: {
              userId_groupId: {
                userId: socket.userId,
                groupId: socket.currentGroupId,
              },
            },
            data: {
              lastLatitude: location.latitude,
              lastLongitude: location.longitude,
              lastSeen: new Date(),
            },
          });

          // Broadcast to group
          socket.to(`group-${socket.currentGroupId}`).emit('member-status-update', {
            userId: socket.userId,
            status,
            location,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Update status error:', error);
        socket.emit('error', {
          type: 'STATUS_UPDATE_ERROR',
          message: 'Failed to update status',
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      console.log(`User ${socket.userInfo.displayName} disconnected: ${reason}`);
      
      try {
        // Update user's last seen in all groups
        await prisma.groupMember.updateMany({
          where: { userId: socket.userId },
          data: {
            isLocationShared: false,
            lastSeen: new Date(),
          },
        });

        // Notify groups if user was in any
        if (socket.currentGroupId) {
          socket.to(`group-${socket.currentGroupId}`).emit('member-disconnected', {
            userId: socket.userId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Disconnect cleanup error:', error);
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Global error handling
  io.engine.on('connection_error', (err) => {
    console.error('Socket.io connection error:', err);
  });

  console.log('🔌 Socket.io server initialized');
  return io;
};

module.exports = { initializeSocket };