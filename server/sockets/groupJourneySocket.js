// server/sockets/groupJourneySocket.js
// Real-time group journey coordination via WebSocket

const prisma = require('../prisma/client');

/**
 * Initialize group journey socket handlers
 * @param {object} io - Socket.io server instance
 * @param {object} socket - Individual socket connection
 */
module.exports = (io, socket) => {
  /**
   * Join a group journey room for real-time updates
   */
  socket.on('group-journey:join', async (data) => {
    try {
      const { groupJourneyId } = data;
      const userId = socket.userId;

      // Verify user has an instance for this journey
      const instance = await prisma.journeyInstance.findFirst({
        where: {
          groupJourneyId,
          userId
        },
        include: {
          groupJourney: {
            include: {
              group: true
            }
          }
        }
      });

      if (!instance) {
        socket.emit('error', {
          type: 'JOIN_ERROR',
          message: 'Not a participant in this journey'
        });
        return;
      }

      // Join the group journey room
      const roomName = `group-journey-${groupJourneyId}`;
      socket.join(roomName);
      socket.currentGroupJourneyId = groupJourneyId;

      // Also join the group room for member updates
      socket.join(`group-${instance.groupJourney.groupId}`);
      socket.currentGroupId = instance.groupJourney.groupId;

      // Get all current member locations
      const allInstances = await prisma.journeyInstance.findMany({
        where: { groupJourneyId },
        include: {
          groupJourney: {
            include: {
              group: {
                include: {
                  members: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          displayName: true,
                          photoURL: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Send current state to joining user
      const memberLocations = allInstances.map(inst => {
        const member = inst.groupJourney.group.members.find(m => m.userId === inst.userId);
        return {
          instanceId: inst.id,
          userId: inst.userId,
          displayName: member?.user.displayName,
          photoURL: member?.user.photoURL,
          latitude: inst.currentLatitude,
          longitude: inst.currentLongitude,
          status: inst.status,
          totalDistance: inst.totalDistance,
          totalTime: inst.totalTime,
          lastUpdate: inst.lastLocationUpdate
        };
      });

      socket.emit('group-journey:joined', {
        groupJourneyId,
        roomName,
        memberLocations,
        timestamp: new Date().toISOString()
      });

      // Notify other members that someone joined
      socket.to(roomName).emit('member:connected', {
        userId,
        displayName: socket.userInfo.displayName,
        photoURL: socket.userInfo.photoURL,
        timestamp: new Date().toISOString()
      });

      console.log(`User ${socket.userInfo.displayName} joined group journey ${groupJourneyId}`);
    } catch (error) {
      console.error('Group journey join error:', error);
      socket.emit('error', {
        type: 'JOIN_ERROR',
        message: 'Failed to join group journey'
      });
    }
  });

  /**
   * Leave a group journey room
   */
  socket.on('group-journey:leave', (data) => {
    try {
      const { groupJourneyId } = data;
      const roomName = `group-journey-${groupJourneyId}`;
      
      socket.leave(roomName);
      
      // Notify others
      socket.to(roomName).emit('member:disconnected', {
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });

      socket.emit('group-journey:left', {
        groupJourneyId,
        timestamp: new Date().toISOString()
      });

      console.log(`User ${socket.userInfo.displayName} left group journey ${groupJourneyId}`);
    } catch (error) {
      console.error('Group journey leave error:', error);
    }
  });

  /**
   * Optional: Create an event via socket (wrapper around REST)
   * Kept minimal: validate participant and broadcast, store in DB
   */
  socket.on('group-journey:post-event', async (payload) => {
    try {
      const { groupJourneyId, type, message, latitude, longitude, mediaUrl, data } = payload || {};
      if (!groupJourneyId || !type) return;

      // Verify participant and resolve instance
      const instance = await prisma.journeyInstance.findFirst({
        where: { groupJourneyId, userId: socket.userId },
        select: { id: true }
      });
      if (!instance) return; // Not a participant

      const created = await prisma.rideEvent.create({
        data: {
          groupJourneyId,
          instanceId: instance.id,
          userId: socket.userId,
          type,
          message: message || null,
          latitude: typeof latitude === 'number' ? latitude : null,
          longitude: typeof longitude === 'number' ? longitude : null,
          mediaUrl: mediaUrl || null,
          data: data || null,
        }
      });

      const user = socket.userInfo;
      io.to(`group-journey-${groupJourneyId}`).emit('group-journey:event', {
        id: created.id,
        groupJourneyId,
        user: { id: user.id, displayName: user.displayName, photoURL: user.photoURL },
        type: created.type,
        message: created.message,
        latitude: created.latitude,
        longitude: created.longitude,
        mediaUrl: created.mediaUrl,
        data: created.data,
        createdAt: created.createdAt,
      });
    } catch (error) {
      console.error('group-journey:post-event error:', error);
    }
  });

  /**
   * Real-time location update during journey
   * This is called frequently (every few seconds) while user is moving
   */
  socket.on('instance:location-update', async (data) => {
    try {
      const {
        instanceId,
        latitude,
        longitude,
        speed,
        distance,
        heading
      } = data;

      const userId = socket.userId;

      // Quick validation
      if (!instanceId || !latitude || !longitude) {
        return;
      }

      // Verify ownership (lightweight check)
      const instance = await prisma.journeyInstance.findUnique({
        where: { id: instanceId },
        select: {
          userId: true,
          groupJourneyId: true,
          status: true
        }
      });

      if (!instance || instance.userId !== userId) {
        return;
      }

      if (instance.status !== 'ACTIVE') {
        return;
      }

      // Update location in database (async, don't wait)
      prisma.journeyInstance.update({
        where: { id: instanceId },
        data: {
          currentLatitude: latitude,
          currentLongitude: longitude,
          lastLocationUpdate: new Date()
        }
      }).catch(err => console.error('Location update error:', err));

      // Broadcast to other members immediately
      const roomName = `group-journey-${instance.groupJourneyId}`;
      socket.to(roomName).emit('member:location-updated', {
        instanceId,
        userId,
        displayName: socket.userInfo.displayName,
        photoURL: socket.userInfo.photoURL,
        latitude,
        longitude,
        speed,
        distance,
        heading,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Location update error:', error);
    }
  });

  /**
   * Member requests current state of all participants
   */
  socket.on('group-journey:request-state', async (data) => {
    try {
      const { groupJourneyId } = data;
      const userId = socket.userId;

      // Verify user is a participant
      const myInstance = await prisma.journeyInstance.findFirst({
        where: {
          groupJourneyId,
          userId
        }
      });

      if (!myInstance) {
        socket.emit('error', {
          type: 'UNAUTHORIZED',
          message: 'Not a participant in this journey'
        });
        return;
      }

      // Get all instances with member info
      const instances = await prisma.journeyInstance.findMany({
        where: { groupJourneyId },
        include: {
          groupJourney: {
            include: {
              group: {
                include: {
                  members: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          displayName: true,
                          photoURL: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      const memberStates = instances.map(inst => {
        const member = inst.groupJourney.group.members.find(m => m.userId === inst.userId);
        return {
          instanceId: inst.id,
          userId: inst.userId,
          displayName: member?.user.displayName,
          photoURL: member?.user.photoURL,
          status: inst.status,
          latitude: inst.currentLatitude,
          longitude: inst.currentLongitude,
          totalDistance: inst.totalDistance,
          totalTime: inst.totalTime,
          avgSpeed: inst.avgSpeed,
          topSpeed: inst.topSpeed,
          lastUpdate: inst.lastLocationUpdate
        };
      });

      socket.emit('group-journey:state', {
        groupJourneyId,
        members: memberStates,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Request state error:', error);
      socket.emit('error', {
        type: 'STATE_ERROR',
        message: 'Failed to get journey state'
      });
    }
  });

  /**
   * Handle socket disconnect cleanup
   */
  const originalDisconnect = socket.disconnect;
  socket.disconnect = async function(...args) {
    try {
      if (socket.currentGroupJourneyId) {
        const roomName = `group-journey-${socket.currentGroupJourneyId}`;
        socket.to(roomName).emit('member:disconnected', {
          userId: socket.userId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Disconnect cleanup error:', error);
    }
    return originalDisconnect.apply(socket, args);
  };
};
