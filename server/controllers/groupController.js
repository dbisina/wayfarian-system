// Group Controller
// server/controllers/groupController.js

const { PrismaClient } = require('@prisma/client');
const { generateRandomString } = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * Create a new group
 */
const createGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, maxMembers, isPrivate } = req.body;

    // Generate unique group code
    let code;
    let isUnique = false;
    
    while (!isUnique) {
      code = generateRandomString(6);
      const existing = await prisma.group.findUnique({
        where: { code }
      });
      if (!existing) isUnique = true;
    }

    // Create group
    const group = await prisma.group.create({
      data: {
        name,
        description,
        code,
        creatorId: userId,
        maxMembers: maxMembers || 10,
        isPrivate: isPrivate || false,
      }
    });

    // Add creator as member
    await prisma.groupMember.create({
      data: {
        userId,
        groupId: group.id,
        role: 'CREATOR'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: {
        ...group,
        memberCount: 1
      }
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      error: 'Failed to create group',
      message: error.message
    });
  }
};

/**
 * Join a group using code
 */
const joinGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    // Find group by code
    const group = await prisma.group.findUnique({
      where: { code },
      include: {
        _count: {
          select: { members: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        error: 'Invalid code',
        message: 'No group found with this code'
      });
    }

    if (!group.isActive) {
      return res.status(400).json({
        error: 'Group inactive',
        message: 'This group is no longer active'
      });
    }

    // Check if already a member
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId: group.id
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({
        error: 'Already a member',
        message: 'You are already a member of this group'
      });
    }

    // Check if group is full
    if (group._count.members >= group.maxMembers) {
      return res.status(400).json({
        error: 'Group full',
        message: 'This group has reached its maximum capacity'
      });
    }

    // Add user to group
    const membership = await prisma.groupMember.create({
      data: {
        userId,
        groupId: group.id,
        role: 'MEMBER'
      },
      include: {
        group: true
      }
    });

    res.json({
      success: true,
      message: 'Joined group successfully',
      group: membership.group
    });

  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({
      error: 'Failed to join group',
      message: error.message
    });
  }
};

/**
 * Leave a group
 */
const leaveGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
      }
    });

    if (!membership) {
      return res.status(404).json({
        error: 'Not a member',
        message: 'You are not a member of this group'
      });
    }

    // Check if user is creator
    if (membership.role === 'CREATOR') {
      // Transfer ownership or delete group if last member
      const memberCount = await prisma.groupMember.count({
        where: { groupId }
      });

      if (memberCount === 1) {
        // Delete group if creator is the only member
        await prisma.group.delete({
          where: { id: groupId }
        });
      } else {
        // Transfer ownership to next admin or member
        const nextOwner = await prisma.groupMember.findFirst({
          where: {
            groupId,
            userId: { not: userId },
            role: 'ADMIN'
          }
        });

        if (nextOwner) {
          await prisma.groupMember.update({
            where: { id: nextOwner.id },
            data: { role: 'CREATOR' }
          });
        } else {
          // Make the oldest member the new creator
          const oldestMember = await prisma.groupMember.findFirst({
            where: {
              groupId,
              userId: { not: userId }
            },
            orderBy: { joinedAt: 'asc' }
          });

          if (oldestMember) {
            await prisma.groupMember.update({
              where: { id: oldestMember.id },
              data: { role: 'CREATOR' }
            });
          }
        }
      }
    }

    // Remove user from group
    await prisma.groupMember.delete({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
      }
    });

    res.json({
      success: true,
      message: 'Left group successfully'
    });

  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({
      error: 'Failed to leave group',
      message: error.message
    });
  }
};

/**
 * Get user's groups
 */
const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id;

    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            _count: {
              select: { members: true }
            }
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    const groups = memberships.map(m => ({
      ...m.group,
      role: m.role,
      joinedAt: m.joinedAt,
      memberCount: m.group._count.members
    }));

    res.json({
      success: true,
      groups,
      count: groups.length
    });

  } catch (error) {
    console.error('Get user groups error:', error);
    res.status(500).json({
      error: 'Failed to get groups',
      message: error.message
    });
  }
};

/**
 * Get group details
 */
const getGroupDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group'
      });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            photoURL: true
          }
        },
        _count: {
          select: {
            members: true,
            journeys: true
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        error: 'Group not found'
      });
    }

    res.json({
      success: true,
      group: {
        ...group,
        userRole: membership.role,
        memberCount: group._count.members,
        journeyCount: group._count.journeys
      }
    });

  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({
      error: 'Failed to get group details',
      message: error.message
    });
  }
};

/**
 * Get group members
 */
const getGroupMembers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group'
      });
    }

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
            totalDistance: true,
            totalTrips: true,
            topSpeed: true
          }
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    res.json({
      success: true,
      members: members.map(m => ({
        ...m.user,
        role: m.role,
        joinedAt: m.joinedAt,
        lastSeen: m.lastSeen,
        isLocationShared: m.isLocationShared
      })),
      count: members.length
    });

  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      error: 'Failed to get members',
      message: error.message
    });
  }
};

/**
 * Update group details
 */
const updateGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { name, description, maxMembers, isPrivate } = req.body;

    // Check if user is creator or admin
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
      }
    });

    if (!membership || (membership.role !== 'CREATOR' && membership.role !== 'ADMIN')) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'Only group creator or admin can update group'
      });
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(maxMembers && { maxMembers }),
        ...(isPrivate !== undefined && { isPrivate }),
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Group updated successfully',
      group: updatedGroup
    });

  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      error: 'Failed to update group',
      message: error.message
    });
  }
};

/**
 * Delete a group
 */
const deleteGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    // Check if user is creator
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        error: 'Group not found'
      });
    }

    if (group.creatorId !== userId) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'Only group creator can delete the group'
      });
    }

    // Delete group (cascade will handle members and journeys)
    await prisma.group.delete({
      where: { id: groupId }
    });

    res.json({
      success: true,
      message: 'Group deleted successfully'
    });

  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({
      error: 'Failed to delete group',
      message: error.message
    });
  }
};

module.exports = {
  createGroup,
  joinGroup,
  leaveGroup,
  getUserGroups,
  getGroupDetails,
  getGroupMembers,
  updateGroup,
  deleteGroup
};