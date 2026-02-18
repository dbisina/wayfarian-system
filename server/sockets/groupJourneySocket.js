// server/sockets/groupJourneySocket.js
// Real-time handlers for group journeys (rooms, snapshots, live telemetry)

const prisma = require('../prisma/client');
const { buildMemberSnapshot } = require('../services/JourneyInstanceService');

module.exports = (io, socket) => {
  const emitState = async (groupJourneyId, target = socket) => {
    const members = await buildMemberSnapshot(groupJourneyId);
    target.emit('group-journey:state', {
      groupJourneyId,
      members,
      timestamp: new Date().toISOString(),
    });
    return members;
  };

  socket.on('group-journey:join', async data => {
    try {
      const { groupJourneyId } = data || {};
      if (!groupJourneyId) return;

      const journey = await prisma.groupJourney.findUnique({
        where: { id: groupJourneyId },
        include: {
          group: {
            select: {
              id: true,
              members: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (!journey) {
        socket.emit('error', { type: 'JOIN_ERROR', message: 'Journey not found' });
        return;
      }

      const isMember = journey.group.members.some(m => m.userId === socket.userId);
      if (!isMember) {
        socket.emit('error', { type: 'JOIN_ERROR', message: 'Not a member of this group' });
        return;
      }

      socket.join(`group-journey-${groupJourneyId}`);
      socket.currentGroupJourneyId = groupJourneyId;
      // Also set currentGroupId for location sharing compatibility
      if (journey.groupId) {
        socket.currentGroupId = journey.groupId;
        // Also join the group room for compatibility
        socket.join(`group-${journey.groupId}`);
      }

      const memberLocations = await emitState(groupJourneyId);

      
      socket.emit('group-journey:joined', {
        groupJourneyId,
        groupJourney: {
          id: journey.id,
          groupId: journey.groupId,
          title: journey.title,
          description: journey.description,
          startLatitude: journey.startLatitude,
          startLongitude: journey.startLongitude,
          endLatitude: journey.endLatitude,
          endLongitude: journey.endLongitude,
          status: journey.status,
        },
        memberLocations,
        timestamp: new Date().toISOString(),
      });

      socket.to(`group-journey-${groupJourneyId}`).emit('member:connected', {
        userId: socket.userId,
        displayName: socket.userInfo.displayName,
        photoURL: socket.userInfo.photoURL,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('group-journey:join error', error);
      socket.emit('error', { type: 'JOIN_ERROR', message: 'Failed to join journey' });
    }
  });

  socket.on('group-journey:leave', data => {
    try {
      const { groupJourneyId } = data || {};
      if (!groupJourneyId) return;
      socket.leave(`group-journey-${groupJourneyId}`);
      if (socket.currentGroupJourneyId === groupJourneyId) {
        socket.currentGroupJourneyId = undefined;
      }
      socket.to(`group-journey-${groupJourneyId}`).emit('member:disconnected', {
        userId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('group-journey:leave error', error);
    }
  });

  socket.on('group-journey:request-state', async data => {
    try {
      const { groupJourneyId } = data || {};
      if (!groupJourneyId) return;
      await emitState(groupJourneyId);
    } catch (error) {
      console.error('group-journey:request-state error', error);
      socket.emit('error', { type: 'STATE_ERROR', message: 'Unable to fetch journey state' });
    }
  });

  // Per-instance throttle for location updates (prevents DB flooding)
  const lastLocationEmit = {};

  socket.on('instance:location-update', async data => {
    try {
      const { instanceId, latitude, longitude, speed, heading, totalDistance } = data || {};
      if (!instanceId || typeof latitude !== 'number' || typeof longitude !== 'number') {
        return;
      }

      // Rate limit: max one DB write per instance every 2 seconds
      const now = Date.now();
      if (lastLocationEmit[instanceId] && now - lastLocationEmit[instanceId] < 2000) return;
      lastLocationEmit[instanceId] = now;

      const instance = await prisma.journeyInstance.findUnique({
        where: { id: instanceId },
        select: {
          id: true,
          userId: true,
          status: true,
          groupJourneyId: true,
        },
      });

      if (!instance || instance.userId !== socket.userId || instance.status !== 'ACTIVE') {
        return;
      }

      // Build update data — include totalDistance from client if provided
      const updateData = {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
        routePoints: {
          push: {
            latitude,
            longitude,
            timestamp: new Date().toISOString(),
            speed: speed ?? null,
            heading: heading ?? null,
          },
        },
      };
      // Client sends totalDistance from smart tracking (Roads API snapped distance)
      if (typeof totalDistance === 'number' && totalDistance >= 0) {
        updateData.totalDistance = totalDistance;
      }

      const updated = await prisma.journeyInstance.update({
        where: { id: instanceId },
        data: updateData,
      });

      const payload = {
        instanceId,
        userId: socket.userId,
        displayName: socket.userInfo.displayName,
        photoURL: socket.userInfo.photoURL,
        latitude,
        longitude,
        speed: speed ?? undefined,
        heading: heading ?? undefined,
        totalDistance: updated.totalDistance,
        totalTime: updated.totalTime,
        status: updated.status,
        lastUpdate: updated.lastLocationUpdate?.toISOString?.() || new Date().toISOString(),
      };

      io.to(`group-journey-${instance.groupJourneyId}`).emit('member:location-updated', payload);
    } catch (error) {
      console.error('instance:location-update error', error);
    }
  });

  socket.on('disconnect', () => {
    if (socket.currentGroupJourneyId) {
      io.to(`group-journey-${socket.currentGroupJourneyId}`).emit('member:disconnected', {
        userId: socket.userId,
        timestamp: new Date().toISOString(),
      });
      socket.leave(`group-journey-${socket.currentGroupJourneyId}`);
      socket.currentGroupJourneyId = undefined;
    }
    if (socket.currentGroupId) {
      socket.leave(`group-${socket.currentGroupId}`);
      socket.currentGroupId = undefined;
    }
  });
};
