// server/controllers/groupJourneyController.js
// Group Journey Controller - Handles group journey coordination with individual instances

const prisma = require('../prisma/client');

/**
 * Start a group journey
 * Creates a parent GroupJourney and individual JourneyInstance for each member
 * Emits socket event to all members to auto-navigate to journey screen
 */
const startGroupJourney = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      groupId, 
      title, 
      description,
      startLatitude, 
      startLongitude,
      endLatitude,
      endLongitude,
      routePoints 
    } = req.body;

    // Validate required fields
    if (!groupId) {
      return res.status(400).json({
        error: 'Missing groupId',
        message: 'groupId is required to start a group journey'
      });
    }
    if (startLatitude == null || startLongitude == null) {
      return res.status(400).json({
        error: 'Missing start coordinates',
        message: 'startLatitude and startLongitude are required'
      });
    }

    console.log('[GroupJourney] Starting journey for group:', groupId, 'by user:', userId);

    // Load group and members first
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                photoURL: true,
                firebaseUid: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        error: 'Group not found'
      });
    }

    const isCreator = group.creatorId === userId;

    // Check membership if not creator
    let membership = null;
    if (!isCreator) {
      membership = await prisma.groupMember.findUnique({
        where: {
          userId_groupId: { userId, groupId }
        }
      });

      if (!membership) {
        return res.status(403).json({
          error: 'Not a member of this group',
          message: 'You must be a member to start a journey'
        });
      }

      if (membership.role !== 'CREATOR' && membership.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: 'Only group creators and admins can start journeys'
        });
      }
    } else {
      // If creator is not in members (data inconsistency), upsert their membership
      const creatorMembership = await prisma.groupMember.upsert({
        where: {
          userId_groupId: { userId: group.creatorId, groupId }
        },
        create: {
          userId: group.creatorId,
          groupId,
          role: 'CREATOR'
        },
        update: {}
      });

      // If creator wasn't previously in group.members, add them to local structure to ensure instances include creator
      const hasCreatorInMembers = group.members.some(m => m.userId === group.creatorId);
      if (!hasCreatorInMembers) {
        group.members.push({
          id: creatorMembership.id,
          userId: creatorMembership.userId,
          role: creatorMembership.role,
          user: await prisma.user.findUnique({
            where: { id: creatorMembership.userId },
            select: { id: true, displayName: true, photoURL: true, firebaseUid: true }
          })
        });
      }
    }

    // Check if group already has an active journey
    const existingJourney = await prisma.groupJourney.findFirst({
      where: {
        groupId,
        status: 'ACTIVE'
      }
    });

    if (existingJourney) {
      return res.status(400).json({
        error: 'Journey already active',
        message: 'Complete or cancel the current journey first'
      });
    }

    // Create group journey with instances for all members
    // Build unique member list (ensure creator included)
    const uniqueMemberUserIds = Array.from(new Set([
      ...group.members.map(m => m.userId),
      group.creatorId
    ]));

    const groupJourney = await prisma.groupJourney.create({
      data: {
        groupId,
        creatorId: userId,
        title,
        description,
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
        routePoints,
        status: 'ACTIVE',
        instances: {
          create: uniqueMemberUserIds.map(uid => ({
            userId: uid,
            status: 'ACTIVE',
            currentLatitude: startLatitude,
            currentLongitude: startLongitude
          }))
        }
      },
      include: {
        instances: {
          include: {
            photos: true
          }
        },
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
    });

    // Emit socket event to all group members
    const io = req.app.get('io');
    if (io) {
      const memberUserIds = Array.from(new Set(groupJourney.group.members.map(m => m.userId)));

      memberUserIds.forEach(memberId => {
        io.to(`user-${memberId}`).emit('group-journey:started', {
          groupJourneyId: groupJourney.id,
          groupId,
          title,
          description,
          creatorId: userId,
          startLatitude,
          startLongitude,
          endLatitude,
          endLongitude,
          timestamp: new Date().toISOString(),
          instances: groupJourney.instances.map(inst => ({
            id: inst.id,
            userId: inst.userId,
            status: inst.status
          }))
        });
      });
    }

    res.json({
      success: true,
      groupJourney: {
        id: groupJourney.id,
        title: groupJourney.title,
        description: groupJourney.description,
        status: groupJourney.status,
        startedAt: groupJourney.startedAt,
        startLatitude: groupJourney.startLatitude,
        startLongitude: groupJourney.startLongitude,
        endLatitude: groupJourney.endLatitude,
        endLongitude: groupJourney.endLongitude,
        instances: groupJourney.instances.map(inst => ({
          id: inst.id,
          userId: inst.userId,
          status: inst.status,
          currentLatitude: inst.currentLatitude,
          currentLongitude: inst.currentLongitude
        })),
        members: groupJourney.group.members.map(m => ({
          id: m.user.id,
          displayName: m.user.displayName,
          photoURL: m.user.photoURL,
          role: m.role
        }))
      }
    });
  } catch (error) {
    console.error('Start group journey error:', error);
    res.status(500).json({
      error: 'Failed to start group journey',
      message: error.message
    });
  }
};

/**
 * Get group journey details with all member instances
 */
const getGroupJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const groupJourney = await prisma.groupJourney.findUnique({
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
      return res.status(404).json({
        error: 'Group journey not found'
      });
    }

    // Verify user is a member
    const isMember = groupJourney.group.members.some(m => m.userId === userId);
    if (!isMember) {
      return res.status(403).json({
        error: 'Not a member of this group'
      });
    }

    // Format response with member details
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
        member: {
          id: member.user.id,
          displayName: member.user.displayName,
          photoURL: member.user.photoURL
        }
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
        startLatitude: groupJourney.startLatitude,
        startLongitude: groupJourney.startLongitude,
        endLatitude: groupJourney.endLatitude,
        endLongitude: groupJourney.endLongitude,
        routePoints: groupJourney.routePoints,
        instances: instancesWithMembers
      }
    });
  } catch (error) {
    console.error('Get group journey error:', error);
    res.status(500).json({
      error: 'Failed to get group journey',
      message: error.message
    });
  }
};

/**
 * Update journey instance location
 * Called frequently as user moves during journey
 */
const updateInstanceLocation = async (req, res) => {
  try {
    const { id } = req.params; // instance ID
    const userId = req.user.id;
    const { 
      latitude, 
      longitude, 
      distance, 
      speed, 
      routePoint 
    } = req.body;

    // Verify instance belongs to user
    const instance = await prisma.journeyInstance.findUnique({
      where: { id },
      include: {
        groupJourney: {
          include: {
            group: true
          }
        }
      }
    });

    if (!instance) {
      return res.status(404).json({
        error: 'Journey instance not found'
      });
    }

    if (instance.userId !== userId) {
      return res.status(403).json({
        error: 'Not your journey instance'
      });
    }

    if (instance.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Journey instance not active'
      });
    }

    // Update route points
    let routePoints = instance.routePoints || [];
    if (routePoint) {
      routePoints = [...routePoints, routePoint];
    }

    // Calculate stats
    const now = new Date();
    const elapsedSeconds = Math.floor((now - instance.startTime) / 1000);
    const newDistance = (instance.totalDistance || 0) + (distance || 0);
    
    // Validate speed before updating topSpeed - cap at 250 km/h to prevent GPS drift issues
    const MAX_REASONABLE_SPEED_KMH = 250;
    const validatedSpeed = Math.min(Math.max(speed || 0, 0), MAX_REASONABLE_SPEED_KMH);
    const newTopSpeed = Math.max(instance.topSpeed || 0, validatedSpeed);
    const calculatedAvgSpeed = elapsedSeconds > 0 ? (newDistance / elapsedSeconds) * 3600 : 0; // km/h (distance in km, time in seconds)
    const newAvgSpeed = Math.min(calculatedAvgSpeed, MAX_REASONABLE_SPEED_KMH); // Cap avgSpeed too

    // Update instance
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

    // Broadcast location to group members via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group-${instance.groupJourney.groupId}`).emit('member:location-updated', {
        instanceId: id,
        userId,
        latitude,
        longitude,
        speed,
        distance: newDistance,
        topSpeed: newTopSpeed,
        timestamp: now.toISOString()
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
    console.error('Update instance location error:', error);
    res.status(500).json({
      error: 'Failed to update location',
      message: error.message
    });
  }
};

/**
 * Complete a journey instance
 * Notifies group when member finishes
 */
const completeInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { endLatitude, endLongitude } = req.body;

    // Verify instance belongs to user
    const instance = await prisma.journeyInstance.findUnique({
      where: { id },
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

    if (!instance) {
      return res.status(404).json({
        error: 'Journey instance not found'
      });
    }

    if (instance.userId !== userId) {
      return res.status(403).json({
        error: 'Not your journey instance'
      });
    }

    if (instance.status === 'COMPLETED') {
      return res.status(400).json({
        error: 'Journey already completed'
      });
    }

    const now = new Date();
    const totalTime = Math.floor((now - instance.startTime) / 1000);

    // Complete instance
    const completed = await prisma.journeyInstance.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endTime: now,
        totalTime,
        currentLatitude: endLatitude || instance.currentLatitude,
        currentLongitude: endLongitude || instance.currentLongitude
      }
    });

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        photoURL: true
      }
    });

    // Update user stats
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalDistance: { increment: completed.totalDistance },
        totalTime: { increment: completed.totalTime },
        topSpeed: Math.max(completed.topSpeed, 0),
        totalTrips: { increment: 1 }
      }
    });

    // Check if all instances are completed
    const allInstances = await prisma.journeyInstance.count({
      where: {
        groupJourneyId: instance.groupJourneyId
      }
    });

    const completedInstances = await prisma.journeyInstance.count({
      where: {
        groupJourneyId: instance.groupJourneyId,
        status: 'COMPLETED'
      }
    });

    const allCompleted = allInstances === completedInstances;

    // If all completed, mark group journey as completed
    if (allCompleted) {
      await prisma.groupJourney.update({
        where: { id: instance.groupJourneyId },
        data: {
          status: 'COMPLETED',
          completedAt: now
        }
      });
    }

    // Broadcast completion to group
    const io = req.app.get('io');
    if (io) {
      io.to(`group-${instance.groupJourney.groupId}`).emit('member:journey-completed', {
        instanceId: id,
        groupJourneyId: instance.groupJourneyId,
        userId,
        user: {
          id: user.id,
          displayName: user.displayName,
          photoURL: user.photoURL
        },
        stats: {
          totalDistance: completed.totalDistance,
          totalTime: completed.totalTime,
          avgSpeed: completed.avgSpeed,
          topSpeed: completed.topSpeed
        },
        allCompleted,
        timestamp: now.toISOString()
      });
    }

    res.json({
      success: true,
      message: allCompleted ? 'Group journey completed!' : 'Journey completed!',
      instance: {
        id: completed.id,
        status: completed.status,
        totalDistance: completed.totalDistance,
        totalTime: completed.totalTime,
        avgSpeed: completed.avgSpeed,
        topSpeed: completed.topSpeed,
        endTime: completed.endTime
      },
      allCompleted
    });
  } catch (error) {
    console.error('Complete instance error:', error);
    res.status(500).json({
      error: 'Failed to complete journey',
      message: error.message
    });
  }
};

/**
 * Pause journey instance
 */
const pauseInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const instance = await prisma.journeyInstance.findUnique({
      where: { id }
    });

    if (!instance || instance.userId !== userId) {
      return res.status(403).json({
        error: 'Journey instance not found or unauthorized'
      });
    }

    if (instance.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Can only pause active journeys'
      });
    }

    const updated = await prisma.journeyInstance.update({
      where: { id },
      data: { status: 'PAUSED' }
    });

    // Broadcast pause to group
    const io = req.app.get('io');
    if (io) {
      const groupJourney = await prisma.groupJourney.findUnique({
        where: { id: instance.groupJourneyId },
        select: { groupId: true }
      });
      
      if (groupJourney) {
        io.to(`group-${groupJourney.groupId}`).emit('member:journey-paused', {
          instanceId: id,
          userId,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      instance: {
        id: updated.id,
        status: updated.status
      }
    });
  } catch (error) {
    console.error('Pause instance error:', error);
    res.status(500).json({
      error: 'Failed to pause journey',
      message: error.message
    });
  }
};

/**
 * Resume journey instance
 */
const resumeInstance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const instance = await prisma.journeyInstance.findUnique({
      where: { id }
    });

    if (!instance || instance.userId !== userId) {
      return res.status(403).json({
        error: 'Journey instance not found or unauthorized'
      });
    }

    if (instance.status !== 'PAUSED') {
      return res.status(400).json({
        error: 'Can only resume paused journeys'
      });
    }

    const updated = await prisma.journeyInstance.update({
      where: { id },
      data: { status: 'ACTIVE' }
    });

    // Broadcast resume to group
    const io = req.app.get('io');
    if (io) {
      const groupJourney = await prisma.groupJourney.findUnique({
        where: { id: instance.groupJourneyId },
        select: { groupId: true }
      });
      
      if (groupJourney) {
        io.to(`group-${groupJourney.groupId}`).emit('member:journey-resumed', {
          instanceId: id,
          userId,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      instance: {
        id: updated.id,
        status: updated.status
      }
    });
  } catch (error) {
    console.error('Resume instance error:', error);
    res.status(500).json({
      error: 'Failed to resume journey',
      message: error.message
    });
  }
};

/**
 * Get user's current instance for a group journey
 */
const getMyInstance = async (req, res) => {
  try {
    const { groupJourneyId } = req.params;
    const userId = req.user.id;

    const instance = await prisma.journeyInstance.findUnique({
      where: {
        groupJourneyId_userId: {
          groupJourneyId,
          userId
        }
      },
      include: {
        photos: {
          orderBy: { takenAt: 'desc' }
        }
      }
    });

    if (!instance) {
      return res.status(404).json({
        error: 'Journey instance not found'
      });
    }

    res.json({
      success: true,
      instance
    });
  } catch (error) {
    console.error('Get my instance error:', error);
    res.status(500).json({
      error: 'Failed to get instance',
      message: error.message
    });
  }
};

/**
 * Get the active group journey for a given group (if any)
 */
const getActiveForGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const groupJourney = await prisma.groupJourney.findFirst({
      where: { groupId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        groupId: true,
        title: true,
        description: true,
        startLatitude: true,
        startLongitude: true,
        endLatitude: true,
        endLongitude: true,
        startedAt: true,
        status: true,
      },
    });

    if (!groupJourney) {
      return res.status(404).json({ error: 'No active group journey' });
    }

    res.json({ success: true, groupJourney });
  } catch (error) {
    console.error('Get active group journey error:', error);
    res.status(500).json({ error: 'Failed to get active group journey', message: error.message });
  }
};

/**
 * Join an active group journey by creating an instance for the user if missing
 */
const joinGroupJourney = async (req, res) => {
  try {
    const { id } = req.params; // groupJourneyId
    const userId = req.user.id;

    console.log('[GroupJourney] Join request - journeyId:', id, 'userId:', userId);

    const groupJourney = await prisma.groupJourney.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!groupJourney) {
      console.log('[GroupJourney] Journey not found:', id);
      return res.status(404).json({ 
        error: 'Group journey not found',
        message: 'The group journey does not exist or has been deleted'
      });
    }

    if (groupJourney.status !== 'ACTIVE') {
      console.log('[GroupJourney] Journey not active, status:', groupJourney.status);
      return res.status(400).json({ 
        error: 'Group journey is not active',
        message: 'This group journey has ended or been cancelled'
      });
    }

    // Verify membership in the group
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId: groupJourney.groupId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Check for existing instance
    let instance = await prisma.journeyInstance.findUnique({
      where: {
        groupJourneyId_userId: { groupJourneyId: id, userId },
      },
    });

    if (!instance) {
      // Create new instance starting at group start location
      instance = await prisma.journeyInstance.create({
        data: {
          groupJourneyId: id,
          userId,
          status: 'ACTIVE',
          currentLatitude: groupJourney.startLatitude,
          currentLongitude: groupJourney.startLongitude,
        },
      });

      // Broadcast that a member joined (optional)
      const io = req.app.get('io');
      if (io) {
        io.to(`group-${groupJourney.groupId}`).emit('member:joined-group-journey', {
          groupJourneyId: id,
          userId,
          instanceId: instance.id,
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({ success: true, instance: { id: instance.id, userId: instance.userId, status: instance.status } });
  } catch (error) {
    console.error('Join group journey error:', error);
    res.status(500).json({ error: 'Failed to join group journey', message: error.message });
  }
};

module.exports = {
  startGroupJourney,
  getGroupJourney,
  updateInstanceLocation,
  completeInstance,
  pauseInstance,
  resumeInstance,
  getMyInstance,
  // Added below
  getActiveForGroup,
  joinGroupJourney
};
