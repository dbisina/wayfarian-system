// Group Socket Handler for Real-time Group Journey Tracking
// server/sockets/groupSocket.js

const prisma = require('../prisma/client');

/**
 * Handle group-related socket events
 * @param {object} io - Socket.io server instance
 * @param {object} socket - Individual socket connection
 */
const groupSocket = (io, socket) => {
  
  /**
   * Join a group room for real-time updates
   */
  socket.on('join-group', async (data) => {
    try {
      const { groupId } = data;
      const userId = socket.userId;
      
      // Verify user is member of the group
      const membership = await prisma.groupMember.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
        include: {
          group: {
            select: { name: true, isActive: true },
          },
          user: {
            select: { displayName: true, photoURL: true },
          },
        },
      });
      
      if (!membership || !membership.group.isActive) {
        socket.emit('error', {
          type: 'GROUP_JOIN_ERROR',
          message: 'Not authorized to join this group',
        });
        return;
      }
      
      // Join the group room
      socket.join(`group-${groupId}`);
      socket.currentGroupId = groupId;
      
      // Update user's last seen
      await prisma.groupMember.update({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
        data: {
          lastSeen: new Date(),
        },
      });
      
      // Notify other group members
      socket.to(`group-${groupId}`).emit('member-joined', {
        userId,
        displayName: membership.user.displayName,
        photoURL: membership.user.photoURL,
        timestamp: new Date().toISOString(),
      });
      
      socket.emit('group-joined', {
        groupId,
        groupName: membership.group.name,
        message: 'Successfully joined group',
      });
      
    } catch (error) {
      console.error('Join group error:', error);
      socket.emit('error', {
        type: 'GROUP_JOIN_ERROR',
        message: 'Failed to join group',
      });
    }
  });
  
  /**
   * Share real-time location with group members
   */
  socket.on('share-location', async (data) => {
    try {
      const { latitude, longitude, speed, heading } = data;
      const userId = socket.userId;
      const groupId = socket.currentGroupId;
      
      if (!groupId) {
        socket.emit('error', {
          type: 'LOCATION_SHARE_ERROR',
          message: 'Not in a group',
        });
        return;
      }
      
      // Update member's location in database
      await prisma.groupMember.update({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
        data: {
          lastLatitude: latitude,
          lastLongitude: longitude,
          lastSeen: new Date(),
          isLocationShared: true,
        },
      });
      
      // Broadcast location to group members
      socket.to(`group-${groupId}`).emit('member-location-update', {
        userId,
        location: {
          latitude,
          longitude,
          speed: speed || 0,
          heading: heading || 0,
          timestamp: new Date().toISOString(),
        },
      });
      
    } catch (error) {
      console.error('Share location error:', error);
      socket.emit('error', {
        type: 'LOCATION_SHARE_ERROR',
        message: 'Failed to share location',
      });
    }
  });
  
  /**
   * Get current locations of all group members
   */
  socket.on('get-group-locations', async (data) => {
    try {
      const { groupId } = data;
      const userId = socket.userId;
      
      // Verify user is member of the group
      const membership = await prisma.groupMember.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
      });
      
      if (!membership) {
        socket.emit('error', {
          type: 'GROUP_ACCESS_ERROR',
          message: 'Not authorized to access this group',
        });
        return;
      }
      
      // Get all group members' locations
      const members = await prisma.groupMember.findMany({
        where: {
          groupId,
          isLocationShared: true,
          lastLatitude: { not: null },
          lastLongitude: { not: null },
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              photoURL: true,
            },
          },
        },
      });
      
      const locations = members.map(member => ({
        userId: member.userId,
        displayName: member.user.displayName,
        photoURL: member.user.photoURL,
        location: {
          latitude: member.lastLatitude,
          longitude: member.lastLongitude,
          lastSeen: member.lastSeen,
        },
      }));
      
      socket.emit('group-locations', {
        groupId,
        locations,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error('Get group locations error:', error);
      socket.emit('error', {
        type: 'GROUP_LOCATIONS_ERROR',
        message: 'Failed to get group locations',
      });
    }
  });
  
  /**
   * Leave group room
   */
  socket.on('leave-group', async (data) => {
    try {
      const { groupId } = data;
      const userId = socket.userId;
      
      // Leave the group room
      socket.leave(`group-${groupId}`);
      socket.currentGroupId = null;
      
      // Update location sharing status
      await prisma.groupMember.update({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
        data: {
          isLocationShared: false,
          lastSeen: new Date(),
        },
      });
      
      // Notify other group members
      socket.to(`group-${groupId}`).emit('member-left', {
        userId,
        timestamp: new Date().toISOString(),
      });
      
      socket.emit('group-left', {
        groupId,
        message: 'Successfully left group',
      });
      
    } catch (error) {
      console.error('Leave group error:', error);
      socket.emit('error', {
        type: 'GROUP_LEAVE_ERROR',
        message: 'Failed to leave group',
      });
    }
  });
  
  /**
   * Handle disconnection
   */
  socket.on('disconnect', async () => {
    try {
      const userId = socket.userId;
      const groupId = socket.currentGroupId;
      
      if (groupId) {
        // Update location sharing status
        await prisma.groupMember.updateMany({
          where: {
            userId,
          },
          data: {
            isLocationShared: false,
            lastSeen: new Date(),
          },
        });
        
        // Notify group members
        socket.to(`group-${groupId}`).emit('member-disconnected', {
          userId,
          timestamp: new Date().toISOString(),
        });
      }
      
    } catch (error) {
      console.error('Socket disconnect error:', error);
    }
  });
};

module.exports = groupSocket;

