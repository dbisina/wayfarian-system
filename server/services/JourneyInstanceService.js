// server/services/JourneyInstanceService.js
// Centralized helpers for journey instance lookups and snapshots

const prisma = require('../prisma/client');

const BASE_USER_SELECT = {
  id: true,
  displayName: true,
  photoURL: true,
};

async function fetchInstanceWithUser(groupJourneyId, userId) {
  if (!groupJourneyId || !userId) {
    throw new Error('groupJourneyId and userId are required');
  }

  return prisma.journeyInstance.findFirst({
    where: {
      groupJourneyId,
      userId,
    },
    include: {
      user: {
        select: BASE_USER_SELECT,
      },
    },
  });
}

async function buildMemberSnapshot(groupJourneyId) {
  if (!groupJourneyId) {
    throw new Error('groupJourneyId is required');
  }

  const instances = await prisma.journeyInstance.findMany({
    where: { groupJourneyId },
    include: {
      user: {
        select: BASE_USER_SELECT,
      },
    },
  });

  return instances.map((inst) => ({
    instanceId: inst.id,
    userId: inst.userId,
    displayName: inst.user?.displayName || 'Member',
    photoURL: inst.user?.photoURL || null,
    status: inst.status,
    latitude: inst.currentLatitude,
    longitude: inst.currentLongitude,
    totalDistance: inst.totalDistance,
    totalTime: inst.totalTime,
    lastUpdate: inst.lastLocationUpdate?.toISOString?.() || null,
  }));
}

module.exports = {
  BASE_USER_SELECT,
  fetchInstanceWithUser,
  buildMemberSnapshot,
};
