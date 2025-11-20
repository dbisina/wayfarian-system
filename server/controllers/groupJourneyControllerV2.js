// server/controllers/groupJourneyControllerV2.js
// OPTIMIZED Group Journey Controller with Redis caching and individual start locations

const prisma = require('../prisma/client');
const redisService = require('../services/RedisService');
const logger = require('../services/Logger');
const jobQueue = require('../services/JobQueue');
const { fetchInstanceWithUser } = require('../services/JourneyInstanceService');

/**
 * FIXED: Start a group journey
 * - Creator sets the DESTINATION only
 * - Each member (including creator) starts individually with their own location
 * - Creates empty parent GroupJourney (NO instances created here)
 */
const startGroupJourney = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      groupId, 
      title, 
      description,
      endLatitude,
      endLongitude,
    } = req.body;

    // Validate required fields
    if (!groupId) {
      return res.status(400).json({
        error: 'Missing groupId',
        message: 'groupId is required to start a group journey'
      });
    }
    if (endLatitude == null || endLongitude == null) {
      return res.status(400).json({
        error: 'Missing destination coordinates',
        message: 'endLatitude and endLongitude are required'
      });
    }

    logger.info(`[GroupJourney] Starting journey for group: ${groupId} by user: ${userId}`);

    // Check cache first
    const cacheKey = redisService.key('group', groupId);
    let group = await redisService.get(cacheKey);
    
    if (!group) {
      // Load from database
      group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  photoURL: true,
                }
              }
            }
          }
        }
      });
      
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      // Cache group data
      await redisService.set(cacheKey, group, redisService.TTL.MEDIUM);
    }

    const isCreator = group.creatorId === userId;
    const isMember = group.members.some(m => m.userId === userId);

    // Verify permissions
    if (!isCreator && !isMember) {
      return res.status(403).json({
        error: 'Not a member of this group',
        message: 'You must be a member to start a journey'
      });
    }

    const membership = group.members.find(m => m.userId === userId);
    if (!isCreator && membership?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'Only group creators and admins can start journeys'
      });
    }

    // Check if group already has an active journey
    const activeJourneyCacheKey = redisService.key('group', groupId, 'active-journey');
    let existingJourney = await redisService.get(activeJourneyCacheKey);
    
    if (!existingJourney) {
      existingJourney = await prisma.groupJourney.findFirst({
        where: {
          groupId,
          status: 'ACTIVE'
        },
        select: { id: true }
      });
    }

    if (existingJourney) {
      return res.status(400).json({
        error: 'Journey already active',
        message: 'Complete the current journey first'
      });
    }

    // Create group journey WITHOUT instances
    // Instances will be created when each member individually starts
    const groupJourney = await prisma.groupJourney.create({
      data: {
        groupId,
        creatorId: userId,
        title: title || `${group.name} Ride`,
        description,
        startLatitude: 0, // Placeholder - each member has their own start
        startLongitude: 0, // Placeholder - each member has their own start
        endLatitude,
        endLongitude,
        status: 'ACTIVE',
        // NO instances created here - created when each member starts
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    // Cache the active journey
    await redisService.set(
      activeJourneyCacheKey,
      { id: groupJourney.id, status: 'ACTIVE' },
      redisService.TTL.HOUR
    );

    // Cache journey details
    await redisService.set(
      redisService.key('group-journey', groupJourney.id),
      groupJourney,
      redisService.TTL.HOUR
    );

    // Emit socket event to all group members
    const io = req.app.get('io');
    if (io) {
      const memberUserIds = group.members.map(m => m.userId);

      memberUserIds.forEach(memberId => {
        io.to(`user-${memberId}`).emit('group-journey:started', {
          groupJourneyId: groupJourney.id,
          groupId,
          groupName: group.name,
          title: groupJourney.title,
          description: groupJourney.description,
          creatorId: userId,
          endLatitude,
          endLongitude,
          timestamp: new Date().toISOString(),
        });
      });
      
      logger.info(`[GroupJourney] Emitted start event to ${memberUserIds.length} members`);
    }

    // Fire-and-forget notifications to all members (excluding creator)
    try {
      const notifyUserIds = group.members
        .map(m => m.userId)
        .filter(id => id !== userId);

      notifyUserIds.forEach(uid => {
        jobQueue.add('send-notification', {
          userId: uid,
          type: 'group-journey-started',
          data: {
            groupId,
            groupJourneyId: groupJourney.id,
            groupName: group.name,
            title: groupJourney.title,
          },
        }, { priority: 5 });
      });
      logger.info(`[GroupJourney] Queued push notifications to ${notifyUserIds.length} members`);
    } catch (e) {
      logger.warn('[GroupJourney] Failed to queue push notifications', { error: e.message });
    }

    res.json({
      success: true,
      message: 'Group journey created! Members can now start riding from their location.',
      groupJourney: {
        id: groupJourney.id,
        title: groupJourney.title,
        description: groupJourney.description,
        status: groupJourney.status,
        startedAt: groupJourney.startedAt,
        endLatitude: groupJourney.endLatitude,
        endLongitude: groupJourney.endLongitude,
        members: group.members.map(m => ({
          id: m.user.id,
          displayName: m.user.displayName,
          photoURL: m.user.photoURL,
          role: m.role
        }))
      }
    });
  } catch (error) {
    logger.error('Start group journey error:', error);
    res.status(500).json({
      error: 'Failed to start group journey',
      message: error.message
    });
  }
};

/**
 * NEW: Start individual member's journey instance
 * Each member calls this to start riding from their current location
 */
const startMyInstance = async (req, res) => {
  try {
    const { groupJourneyId } = req.params;
    const userId = req.user.id;
    const {
      startLatitude: rawStartLatitude,
      startLongitude: rawStartLongitude,
      startAddress
    } = req.body;

    const hasCoordinate = value => value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));

    if (!hasCoordinate(rawStartLatitude) || !hasCoordinate(rawStartLongitude)) {
      return res.status(400).json({
        error: 'Missing start location',
        message: 'startLatitude and startLongitude are required'
      });
    }

    const startLatitude = Number(rawStartLatitude);
    const startLongitude = Number(rawStartLongitude);

    if (!Number.isFinite(startLatitude) || !Number.isFinite(startLongitude)) {
      return res.status(400).json({
        error: 'Invalid start location',
        message: 'startLatitude and startLongitude must be numeric'
      });
    }

    logger.info(`[GroupJourney] Member ${userId} starting instance for journey ${groupJourneyId}`);

    // Check cache first
    let groupJourney = await redisService.get(redisService.key('group-journey', groupJourneyId));
    
    if (!groupJourney) {
      groupJourney = await prisma.groupJourney.findUnique({
        where: { id: groupJourneyId },
        include: {
          group: { select: { id: true, name: true } }
        }
      });

      if (!groupJourney) {
        return res.status(404).json({ error: 'Group journey not found' });
      }

      await redisService.set(
        redisService.key('group-journey', groupJourneyId),
        groupJourney,
        redisService.TTL.HOUR
      );
    }

    if (groupJourney.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Group journey is not active',
        message: 'This journey has ended or been cancelled'
      });
    }

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: { userId, groupId: groupJourney.groupId }
      },
      include: {
        user: {
          select: { id: true, displayName: true, photoURL: true }
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Check for active solo journey
    const activeSoloJourney = await prisma.journey.findFirst({
      where: {
        userId,
        status: 'ACTIVE'
      },
      select: { id: true, title: true }
    });

    if (activeSoloJourney) {
      return res.status(400).json({
        error: 'Active journey detected',
        message: 'You must complete or pause your current solo journey before starting a group journey'
      });
    }

    // Check for existing instance
    let instance = await prisma.journeyInstance.findUnique({
      where: {
        groupJourneyId_userId: { groupJourneyId, userId }
      }
    });

    if (instance) {
      if (instance.status === 'ACTIVE') {
        return res.status(400).json({
          error: 'Journey already started',
          message: 'You have already started this journey'
        });
      }
      // If paused or cancelled, allow restart
    }

    // Create new instance with member's start location
    instance = await prisma.journeyInstance.create({
      data: {
        groupJourneyId,
        userId,
        status: 'ACTIVE',
        currentLatitude: startLatitude,
        currentLongitude: startLongitude,
        lastLocationUpdate: new Date(),
        startAddress,
        routePoints: [{ latitude: startLatitude, longitude: startLongitude, timestamp: new Date().toISOString() }]
      }
    });

    // Update group member presence and last known location
    try {
      await prisma.groupMember.update({
        where: { userId_groupId: { userId, groupId: groupJourney.groupId } },
        data: {
          lastLatitude: startLatitude,
          lastLongitude: startLongitude,
          lastSeen: new Date(),
          isLocationShared: true,
        },
      });
    } catch (e) {
      logger.warn('[GroupJourney] Failed to update group member presence on start', { error: e.message });
    }

    // Cache instance
    await redisService.set(
      redisService.key('instance', instance.id),
      instance,
      redisService.TTL.HOUR
    );

    // Invalidate group journey cache to force refresh with new instance
    await redisService.del(redisService.key('group-journey', groupJourneyId, 'full'));

    // Broadcast that member started
    const io = req.app.get('io');
    if (io) {
      io.to(`group-${groupJourney.groupId}`).emit('member:started-instance', {
        groupJourneyId,
        instanceId: instance.id,
        userId,
        user: {
          id: membership.user.id,
          displayName: membership.user.displayName,
          photoURL: membership.user.photoURL
        },
        startLatitude,
        startLongitude,
        timestamp: new Date().toISOString(),
      });

      io.to(`group-journey-${groupJourneyId}`).emit('member:location-updated', {
        instanceId: instance.id,
        userId,
        displayName: membership.user.displayName,
        photoURL: membership.user.photoURL,
        latitude: startLatitude,
        longitude: startLongitude,
        totalDistance: 0,
        totalTime: 0,
        status: 'ACTIVE',
        lastUpdate: instance.lastLocationUpdate?.toISOString?.() || new Date().toISOString(),
      });

      // Also emit ride event
      io.to(`group-journey-${groupJourneyId}`).emit('group-journey:event', {
        type: 'MEMBER_STARTED',
        userId,
        user: membership.user,
        message: `${membership.user.displayName} started riding`,
        latitude: startLatitude,
        longitude: startLongitude,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Journey started! Happy riding!',
      instance: {
        id: instance.id,
        userId: instance.userId,
        status: instance.status,
        startTime: instance.startTime,
        currentLatitude: instance.currentLatitude,
        currentLongitude: instance.currentLongitude
      }
    });
  } catch (error) {
    logger.error('Start my instance error:', error);
    res.status(500).json({
      error: 'Failed to start journey',
      message: error.message
    });
  }
};

/**
 * Get group journey details with caching
 */
const getGroupJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const cacheKey = redisService.key('group-journey', id, 'full');
    let groupJourney = await redisService.get(cacheKey);

    if (!groupJourney) {
      groupJourney = await prisma.groupJourney.findUnique({
        where: { id },
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
          },
          instances: {
            include: {
              photos: {
                orderBy: { takenAt: 'desc' },
                take: 5
              }
            }
          }
        }
      });

      if (!groupJourney) {
        return res.status(404).json({ error: 'Group journey not found' });
      }

      // Cache for 2 minutes (short TTL since instances update frequently)
      await redisService.set(cacheKey, groupJourney, redisService.TTL.SHORT * 2);
    }

    // Verify user is a member
    const isMember = groupJourney.group.members.some(m => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Format response
    const instancesWithMembers = groupJourney.instances.map(inst => {
      const member = groupJourney.group.members.find(m => m.userId === inst.userId);
      return {
        id: inst.id,
        userId: inst.userId,
        status: inst.status,
        startTime: inst.startTime,
        endTime: inst.endTime,
        totalDistance: inst.totalDistance,
        totalTime: inst.totalTime,
        avgSpeed: inst.avgSpeed,
        topSpeed: inst.topSpeed,
        currentLatitude: inst.currentLatitude,
        currentLongitude: inst.currentLongitude,
        lastLocationUpdate: inst.lastLocationUpdate,
        photos: inst.photos,
        member: member ? {
          id: member.user.id,
          displayName: member.user.displayName,
          photoURL: member.user.photoURL
        } : null
      };
    });

    res.json({
      success: true,
      groupJourney: {
        id: groupJourney.id,
        groupId: groupJourney.groupId,
        title: groupJourney.title,
        description: groupJourney.description,
        status: groupJourney.status,
        startedAt: groupJourney.startedAt,
        completedAt: groupJourney.completedAt,
        endLatitude: groupJourney.endLatitude,
        endLongitude: groupJourney.endLongitude,
        routePoints: groupJourney.routePoints,
        instances: instancesWithMembers
      }
    });
  } catch (error) {
    logger.error('Get group journey error:', error);
    res.status(500).json({
      error: 'Failed to get group journey',
      message: error.message
    });
  }
};

/**
 * Update location with caching and optimized broadcasts
 */
const updateInstanceLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { latitude, longitude, distance, speed, routePoint } = req.body;
    const displayName = req.user?.displayName;
    const photoURL = req.user?.photoURL;

    // Get instance from cache or DB
    let instance = await redisService.get(redisService.key('instance', id));
    
    if (!instance) {
      instance = await prisma.journeyInstance.findUnique({
        where: { id },
        include: {
          groupJourney: { select: { id: true, groupId: true, status: true } }
        }
      });

      if (!instance) {
        return res.status(404).json({ error: 'Journey instance not found' });
      }
    }

    if (instance.userId !== userId) {
      return res.status(403).json({ error: 'Not your journey instance' });
    }

    if (instance.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Journey instance not active' });
    }

    // Calculate stats
    const now = new Date();
    const elapsedSeconds = Math.floor((now - new Date(instance.startTime)) / 1000);
    const newDistance = (instance.totalDistance || 0) + (distance || 0);
    const newTopSpeed = Math.max(instance.topSpeed || 0, speed || 0);
    const newAvgSpeed = elapsedSeconds > 0 ? (newDistance / elapsedSeconds) * 3.6 : 0;

    // Update route points
    let routePoints = instance.routePoints || [];
    if (routePoint) {
      routePoints = [...routePoints, routePoint];
    }

    // Update instance in DB
    const updated = await prisma.journeyInstance.update({
      where: { id },
      data: {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: now,
        totalDistance: newDistance,
        totalTime: elapsedSeconds,
        topSpeed: newTopSpeed,
        avgSpeed: newAvgSpeed,
        routePoints
      }
    });

    // Update cache
    await redisService.set(
      redisService.key('instance', id),
      updated,
      redisService.TTL.SHORT
    );

    // Invalidate group journey cache
    await redisService.del(redisService.key('group-journey', instance.groupJourneyId, 'full'));

    // Broadcast location (throttled - socket handles this)
    const io = req.app.get('io');
    if (io) {
      io.to(`group-journey-${instance.groupJourney.id || instance.groupJourneyId}`).emit('member:location-updated', {
        instanceId: id,
        userId,
        displayName,
        photoURL,
        latitude,
        longitude,
        speed,
        distance: newDistance,
        totalDistance: newDistance,
        totalTime: elapsedSeconds,
        heading: routePoint?.heading,
        status: updated.status,
        topSpeed: newTopSpeed,
        lastUpdate: now.toISOString(),
      });
    }

    res.json({
      success: true,
      instance: {
        id: updated.id,
        currentLatitude: updated.currentLatitude,
        currentLongitude: updated.currentLongitude,
        totalDistance: updated.totalDistance,
        totalTime: updated.totalTime,
        avgSpeed: updated.avgSpeed,
        topSpeed: updated.topSpeed
      }
    });
  } catch (error) {
    logger.error('Update instance location error:', error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({
      error: 'Failed to update location',
      message: error.message
    });
  }
};

/**
 * FIXED: Complete journey instance
 * - Updates instance status to 'completed'
 * - Calculates final stats (distance, duration)
 * - Updates user stats and achievements
 * - Clears cache and emits events
 */
const completeInstance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { instanceId: iid, id: idParam } = req.params;
    const instanceId = iid || idParam;

    logger.info(`[Instance] Completing instance: ${instanceId} for user: ${userId}`);

    // Load instance
    const instance = await prisma.journeyInstance.findUnique({
      where: { id: instanceId },
      include: {
        groupJourney: true,
        user: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
      },
    });

    if (!instance) {
      return res.status(404).json({ error: 'Journey instance not found' });
    }

    if (instance.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to complete this instance' });
    }

    // Calculate final stats
    const duration = instance.startTime 
      ? Math.floor((Date.now() - new Date(instance.startTime).getTime()) / 1000) 
      : 0;

    const updatedInstance = await prisma.journeyInstance.update({
      where: { id: instanceId },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
        totalDistance: instance.totalDistance || 0,
        totalTime: duration,
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

    // Update cache
    const instanceKey = redisService.key('instance', instanceId);
    await redisService.set(instanceKey, updatedInstance, redisService.TTL.SHORT);

    // Invalidate group journey cache
    const journeyKey = redisService.key('group-journey', instance.groupJourneyId, 'full');
    await redisService.del(journeyKey);

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`group-journey-${instance.groupJourneyId}`).emit('member:journey-completed', {
        instanceId,
        userId,
        displayName: updatedInstance.user?.displayName,
        distance: updatedInstance.totalDistance,
        duration,
        status: 'COMPLETED',
        lastUpdate: updatedInstance.endTime?.toISOString?.() || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });

      io.to(`group-${instance.groupJourney.groupId}`).emit('group-journey:event', {
        type: 'MEMBER_COMPLETED',
        userId,
        displayName: updatedInstance.user?.displayName,
        instanceId,
        timestamp: new Date(),
      });
    }

    logger.info(`[Instance] Completed: ${instanceId} - Distance: ${updatedInstance.totalDistance}m, Duration: ${duration}s`);

    res.json({
      success: true,
      instance: updatedInstance,
    });
  } catch (error) {
    logger.error('[Instance] Error completing:', error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({ error: 'Failed to complete journey instance' });
  }
};

/**
 * Pause journey instance
 */
const pauseInstance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { instanceId: iid, id: idParam } = req.params;
    const instanceId = iid || idParam;

    const instance = await prisma.journeyInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      return res.status(404).json({ error: 'Journey instance not found' });
    }

    if (instance.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedInstance = await prisma.journeyInstance.update({
      where: { id: instanceId },
      data: { status: 'PAUSED' },
    });

    // Update cache
    const instanceKey = redisService.key('instance', instanceId);
    await redisService.set(instanceKey, updatedInstance, redisService.TTL.SHORT);

    // Invalidate journey cache
    const journeyKey = redisService.key('group-journey', instance.groupJourneyId, 'full');
    await redisService.del(journeyKey);

    // Emit event
    const io = req.app.get('io');
    if (io) {
      io.to(`group-journey-${instance.groupJourneyId}`).emit('member:journey-paused', {
        instanceId,
        userId,
        status: 'PAUSED',
        lastUpdate: new Date().toISOString(),
      });
    }

    res.json({ success: true, instance: updatedInstance });
  } catch (error) {
    logger.error('[Instance] Error pausing:', error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({ error: 'Failed to pause instance' });
  }
};

/**
 * Resume journey instance
 */
const resumeInstance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { instanceId: iid, id: idParam } = req.params;
    const instanceId = iid || idParam;

    const instance = await prisma.journeyInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      return res.status(404).json({ error: 'Journey instance not found' });
    }

    if (instance.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedInstance = await prisma.journeyInstance.update({
      where: { id: instanceId },
      data: { status: 'ACTIVE' },
    });

    // Update cache
    const instanceKey = redisService.key('instance', instanceId);
    await redisService.set(instanceKey, updatedInstance, redisService.TTL.SHORT);

    // Invalidate journey cache
    const journeyKey = redisService.key('group-journey', instance.groupJourneyId, 'full');
    await redisService.del(journeyKey);

    // Emit event
    const io = req.app.get('io');
    if (io) {
      io.to(`group-journey-${instance.groupJourneyId}`).emit('member:journey-resumed', {
        instanceId,
        userId,
        status: 'ACTIVE',
        lastUpdate: new Date().toISOString(),
      });
    }

    res.json({ success: true, instance: updatedInstance });
  } catch (error) {
    logger.error('[Instance] Error resuming:', error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({ error: 'Failed to resume instance' });
  }
};

/**
 * Get my instance for a group journey
 */
const getMyInstance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupJourneyId } = req.params;

    // Check cache first
    const cacheKey = redisService.key('user', userId, 'instance', groupJourneyId);
    let instance = await redisService.get(cacheKey);

    if (!instance) {
      instance = await fetchInstanceWithUser(groupJourneyId, userId);

      if (instance) {
        await redisService.set(cacheKey, instance, redisService.TTL.SHORT);
      }
    }

    res.json({ instance });
  } catch (error) {
    logger.error('[Instance] Error getting my instance:', error);
    res.status(500).json({ error: 'Failed to get instance' });
  }
};

/**
 * Get active journey for a group
 */
const getActiveForGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check cache
    const cacheKey = redisService.key('group', groupId, 'active-journey');
    let journeyId = await redisService.get(cacheKey);

    let journey = null;
    if (journeyId) {
      const journeyKey = redisService.key('group-journey', journeyId, 'full');
      journey = await redisService.get(journeyKey);
    }

    if (!journey) {
      journey = await prisma.groupJourney.findFirst({
        where: {
          groupId,
          status: 'ACTIVE',
        },
        include: {
          instances: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  photoURL: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (journey) {
        await redisService.set(cacheKey, journey.id, redisService.TTL.MEDIUM);
        const journeyKey = redisService.key('group-journey', journey.id, 'full');
        await redisService.set(journeyKey, journey, redisService.TTL.SHORT);
      }
    }

    res.json({ 
      success: true,
      groupJourney: journey 
    });
  } catch (error) {
    logger.error('[GroupJourney] Error getting active journey:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get active journey' 
    });
  }
};

/**
 * Join group journey (create instance if not exists)
 */
const joinGroupJourney = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupJourneyId } = req.params;

    // Check if user already has an instance
    const existingInstance = await prisma.journeyInstance.findFirst({
      where: {
        groupJourneyId,
        userId,
      },
    });

    if (existingInstance) {
      return res.json({ 
        success: true, 
        instance: existingInstance,
        message: 'Already joined'
      });
    }

    // Get journey details
    const journey = await prisma.groupJourney.findUnique({
      where: { id: groupJourneyId },
      include: { group: true },
    });

    if (!journey) {
      return res.status(404).json({ error: 'Group journey not found' });
    }

    // Check if user is group member
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: journey.groupId,
        userId,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a group member' });
    }

    // Return success - user needs to click "Start Riding" to create instance
    res.json({
      success: true,
      journey,
      message: 'Ready to start - click "Start Riding" button when ready',
    });
  } catch (error) {
    logger.error('[GroupJourney] Error joining:', error);
    res.status(500).json({ error: 'Failed to join journey' });
  }
};

/**
 * Get my active or paused group journey instance (lightweight)
 */
const getMyActiveInstance = async (req, res) => {
  try {
    const userId = req.user.id;
    // Look for the most recent ACTIVE or PAUSED instance across any group journey
    const instance = await prisma.journeyInstance.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      include: {
        groupJourney: {
          select: {
            id: true,
            groupId: true,
            title: true,
            status: true,
            endLatitude: true,
            endLongitude: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    if (!instance) return res.json({ instance: null });

    // Minimal payload for overlay usage
    return res.json({
      instance: {
        id: instance.id,
        status: instance.status,
        groupJourneyId: instance.groupJourneyId,
        groupJourney: instance.groupJourney,
      },
    });
  } catch (error) {
    logger.error('[GroupJourney] Error getting my active instance:', error);
    res.status(500).json({ error: 'Failed to get active instance' });
  }
};

// Export all functions
// Cancel endpoint removed per product decision: prefer pause/resume semantics

module.exports = {
  startGroupJourney,
  startMyInstance,
  getGroupJourney,
  updateInstanceLocation,
  completeInstance,
  pauseInstance,
  resumeInstance,
  getMyInstance,
  getActiveForGroup,
  joinGroupJourney,
  getMyActiveInstance,
};
