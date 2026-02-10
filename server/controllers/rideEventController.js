// server/controllers/rideEventController.js
// Ride Event controller: timeline/events for group journeys

const prisma = require('../prisma/client');

/**
 * Verify user is participant of a group journey and return context
 */
async function requireParticipant(userId, groupJourneyId) {
  const groupJourney = await prisma.groupJourney.findUnique({
    where: { id: groupJourneyId },
    include: {
      group: {
        include: { members: true }
      }
    }
  });

  if (!groupJourney) {
    const err = new Error('Group journey not found');
    err.status = 404;
    throw err;
  }

  const isMember = groupJourney.group.members.some(m => m.userId === userId);
  if (!isMember) {
    const err = new Error('Not a member of this group');
    err.status = 403;
    throw err;
  }

  const instance = await prisma.journeyInstance.findFirst({
    where: { groupJourneyId, userId }
  });

  return { groupJourney, instance };
}

/**
 * POST /api/group-journey/:id/events
 * Create a ride event (message/status/checkpoint/photo reference/custom)
 */
const createRideEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: groupJourneyId } = req.params;
    const {
      type, // RideEventType
      message,
      latitude,
      longitude,
      mediaUrl,
      data,
      captureSpeed,
      captureDistance,
    } = req.body;

    const { groupJourney, instance } = await requireParticipant(userId, groupJourneyId);

    // Basic validation
    const allowedTypes = ['MESSAGE', 'PHOTO', 'CHECKPOINT', 'STATUS', 'EMERGENCY', 'CUSTOM'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    const event = await prisma.rideEvent.create({
      data: {
        groupJourneyId,
        instanceId: instance ? instance.id : null,
        userId,
        type,
        message: message || null,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        mediaUrl: mediaUrl || null,
        data: data || null,
        captureSpeed: typeof captureSpeed === 'number' ? captureSpeed : null,
        captureDistance: typeof captureDistance === 'number' ? captureDistance : null,
      },
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } }
      }
    });

    // Emit to group journey room
    const io = req.app.get('io');
    if (io) {
      io.to(`group-journey-${groupJourneyId}`).emit('group-journey:event', {
        id: event.id,
        groupJourneyId,
        user: event.user,
        type: event.type,
        message: event.message,
        latitude: event.latitude,
        longitude: event.longitude,
        mediaUrl: event.mediaUrl,
        data: event.data,
        createdAt: event.createdAt,
      });
    }

    res.json({ success: true, event });
  } catch (error) {
    const status = error.status || 500;
    console.error('Create ride event error:', error);
    res.status(status).json({ error: 'Failed to create event', message: error.message });
  }
};

/**
 * GET /api/group-journey/:id/events
 * List ride events for a group journey (most recent first)
 * Query: since (ISO date) or cursor-based pagination later
 */
const listRideEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: groupJourneyId } = req.params;
    const { since, limit } = req.query;

    await requireParticipant(userId, groupJourneyId);

    const where = { groupJourneyId };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        where.createdAt = { gte: sinceDate };
      }
    }

    const take = Math.min(parseInt(limit || '50', 10) || 50, 100);

    const events = await prisma.rideEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } }
      }
    });

    res.json({ success: true, events });
  } catch (error) {
    const status = error.status || 500;
    console.error('List ride events error:', error);
    res.status(status).json({ error: 'Failed to list events', message: error.message });
  }
};

module.exports = {
  createRideEvent,
  listRideEvents,
};
