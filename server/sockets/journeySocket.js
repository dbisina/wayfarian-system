// Journey Socket Handler for Real-time Journey Updates
// server/sockets/journeySocket.js

const prisma = require('../prisma/client');

/**
 * Handle journey-related socket events
 * @param {object} io - Socket.io server instance
 * @param {object} socket - Individual socket connection
 */
const journeySocket = (io, socket) => {
  
  /**
   * Join journey room for real-time updates
   */
  socket.on('join-journey', async (data) => {
    try {
      const { journeyId } = data;
      const userId = socket.userId;
      
      // Verify user owns the journey
      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
        },
      });
      
      if (!journey) {
        socket.emit('error', {
          type: 'JOURNEY_JOIN_ERROR',
          message: 'Journey not found or not authorized',
        });
        return;
      }
      
      // Join the journey room
      socket.join(`journey-${journeyId}`);
      socket.currentJourneyId = journeyId;
      
      socket.emit('journey-joined', {
        journeyId,
        message: 'Successfully joined journey',
      });
      
    } catch (error) {
      console.error('Join journey error:', error);
      socket.emit('error', {
        type: 'JOURNEY_JOIN_ERROR',
        message: 'Failed to join journey',
      });
    }
  });
  
  /**
   * Broadcast journey stats updates
   */
  socket.on('journey-stats-update', async (data) => {
    try {
      const { journeyId, stats } = data;
      const userId = socket.userId;
      
      // Verify ownership
      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
        },
      });
      
      if (!journey) {
        socket.emit('error', {
          type: 'JOURNEY_UPDATE_ERROR',
          message: 'Journey not found or not authorized',
        });
        return;
      }
      
      // If journey is part of a group, broadcast to group members
      if (journey.groupId) {
        io.to(`group-${journey.groupId}`).emit('member-journey-update', {
          userId,
          journeyId,
          stats: {
            ...stats,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
    } catch (error) {
      console.error('Journey stats update error:', error);
      socket.emit('error', {
        type: 'JOURNEY_UPDATE_ERROR',
        message: 'Failed to update journey stats',
      });
    }
  });
  
  /**
   * Handle emergency/SOS signal
   */
  socket.on('emergency-signal', async (data) => {
    try {
      const { latitude, longitude, message } = data;
      const userId = socket.userId;
      
      // Get user's current group if any
      const activeGroup = await prisma.groupMember.findFirst({
        where: {
          userId,
          isLocationShared: true,
        },
        include: {
          group: {
            select: { id: true, name: true },
          },
          user: {
            select: { displayName: true, phoneNumber: true },
          },
        },
      });
      
      const emergencyData = {
        userId,
        displayName: activeGroup?.user.displayName || 'Unknown User',
        location: { latitude, longitude },
        message: message || 'Emergency assistance needed',
        timestamp: new Date().toISOString(),
      };
      
      // Broadcast to group if user is in one
      if (activeGroup) {
        io.to(`group-${activeGroup.group.id}`).emit('emergency-alert', emergencyData);
      }
      
      // Log emergency event
      console.log('EMERGENCY SIGNAL:', emergencyData);
      
      socket.emit('emergency-sent', {
        message: 'Emergency signal sent successfully',
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error('Emergency signal error:', error);
      socket.emit('error', {
        type: 'EMERGENCY_ERROR',
        message: 'Failed to send emergency signal',
      });
    }
  });
};

module.exports = journeySocket;