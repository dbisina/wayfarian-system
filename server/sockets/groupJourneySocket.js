// server/sockets/groupJourneySocket.js
// Real-time handlers for group journeys (rooms, snapshots, live telemetry)

const prisma = require('../prisma/client');

module.exports = (io, socket) => {
  const buildMemberSnapshot = async groupJourneyId => {
    const instances = await prisma.journeyInstance.findMany({
      where: { groupJourneyId },
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

    return instances.map(inst => ({
      instanceId: inst.id,
      userId: inst.userId,
      displayName: inst.user?.displayName || 'Member',
      photoURL: inst.user?.photoURL,
      status: inst.status,
      latitude: inst.currentLatitude,
      longitude: inst.currentLongitude,
      totalDistance: inst.totalDistance,
      totalTime: inst.totalTime,
      lastUpdate: inst.lastLocationUpdate?.toISOString?.() || null,
    }));
  };

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

  socket.on('instance:location-update', async data => {
    try {
      const { instanceId, latitude, longitude, speed, heading } = data || {};
      if (!instanceId || typeof latitude !== 'number' || typeof longitude !== 'number') {
        return;
      }

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

      const updated = await prisma.journeyInstance.update({
        where: { id: instanceId },
        data: {
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
        },
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
      socket.currentGroupJourneyId = undefined;
    }
  });
};
