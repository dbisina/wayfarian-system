// Group Controller
// server/controllers/groupController.js

const prisma = require('../prisma/client');
const { generateRandomString } = require('../utils/helpers');
const multer = require('multer');
const sharp = require('sharp');
const { uploadToStorage, deleteFromStorage } = require('../services/Firebase');

// Use shared Prisma client

/**
 * Create a new group
 */
const createGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      name, 
      description, 
      maxMembers = 10, 
      isPrivate = false,
      allowLocationSharing = true 
    } = req.body;
    
    // Generate unique group code
    let code;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 5) {
      code = generateRandomString(6);
      const existingGroup = await prisma.group.findUnique({
        where: { code },
      });
      
      if (!existingGroup) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      return res.status(500).json({
        error: 'Failed to generate unique group code',
        message: 'Please try again',
      });
    }
    
    // Create group with creator as first member
    const group = await prisma.group.create({
      data: {
        name,
        description,
        code,
        creatorId: userId,
        maxMembers: parseInt(maxMembers),
        isPrivate,
        allowLocationSharing,
        members: {
          create: {
            userId,
            role: 'CREATOR',
          },
        },
      },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
        members: {
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
        _count: {
          select: { members: true },
        },
      },
    });
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group,
    });
    
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      error: 'Failed to create group',
      message: error.message,
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
          select: { members: true },
        },
      },
    });
    
    if (!group) {
      return res.status(404).json({
        error: 'Group not found',
        message: 'Invalid group code',
      });
    }
    
    if (!group.isActive) {
      return res.status(400).json({
        error: 'Group inactive',
        message: 'This group is no longer active',
      });
    }
    
    // Check if user is already a member
    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId: group.id,
        },
      },
    });
    
    if (existingMembership) {
      return res.status(400).json({
        error: 'Already member',
        message: 'You are already a member of this group',
      });
    }
    
    // Check if group is full
    if (group._count.members >= group.maxMembers) {
      return res.status(400).json({
        error: 'Group full',
        message: 'This group has reached its maximum capacity',
      });
    }
    
    // Add user to group
    const membership = await prisma.groupMember.create({
      data: {
        userId,
        groupId: group.id,
        role: 'MEMBER',
      },
      include: {
        group: {
          include: {
            creator: {
              select: {
                id: true,
                displayName: true,
                photoURL: true,
              },
            },
            members: {
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
            _count: {
              select: { members: true },
            },
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
      },
    });
    
    res.status(201).json({
      success: true,
      message: 'Successfully joined group',
      group: membership.group,
      membership,
    });
    
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({
      error: 'Failed to join group',
      message: error.message,
    });
  }
};

/**
 * Get group details
 */
const getGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
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
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group',
      });
    }
    
    // Get group with members
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                photoURL: true,
                totalDistance: true,
                totalTrips: true,
                topSpeed: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        journeys: {
          where: {
            status: 'ACTIVE',
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
        },
        _count: {
          select: { 
            members: true,
            journeys: true,
          },
        },
      },
    });
    
    if (!group) {
      return res.status(404).json({
        error: 'Group not found',
        message: 'Group not found',
      });
    }
    
    res.json({
      success: true,
      group,
      userMembership: membership,
    });
    
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({
      error: 'Failed to get group',
      message: error.message,
    });
  }
};

/**
 * Get user's groups
 */
const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status = 'active' } = req.query;
    
    const skip = (page - 1) * limit;
    
    const whereClause = {
      userId,
      ...(status === 'active' && {
        group: { isActive: true },
      }),
    };
    
    const [memberships, total] = await Promise.all([
      prisma.groupMember.findMany({
        where: whereClause,
        include: {
          group: {
            include: {
              creator: {
                select: {
                  id: true,
                  displayName: true,
                  photoURL: true,
                },
              },
              _count: {
                select: { 
                  members: true,
                  journeys: true,
                },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit),
      }),
      prisma.groupMember.count({ where: whereClause }),
    ]);
    
    const groups = memberships.map(membership => ({
      ...membership.group,
      userRole: membership.role,
      joinedAt: membership.joinedAt,
    }));
    
    res.json({
      success: true,
      groups,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
    
  } catch (error) {
    console.error('Get user groups error:', error);
    res.status(500).json({
      error: 'Failed to get user groups',
      message: error.message,
    });
  }
};

/**
 * Update group settings
 */
const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { 
      name, 
      description, 
      maxMembers, 
      allowLocationSharing,
      isPrivate 
    } = req.body;
    
    // Verify user is creator or admin
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });
    
    if (!membership || !['CREATOR', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only group creators and admins can update group settings',
      });
    }
    
    // Update group
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(maxMembers && { maxMembers: parseInt(maxMembers) }),
        ...(allowLocationSharing !== undefined && { allowLocationSharing }),
        ...(isPrivate !== undefined && { isPrivate }),
        updatedAt: new Date(),
      },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            photoURL: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });
    
    res.json({
      success: true,
      message: 'Group updated successfully',
      group: updatedGroup,
    });
    
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      error: 'Failed to update group',
      message: error.message,
    });
  }
};

/**
 * Leave group
 */
const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    // Get membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
      include: {
        group: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
    });
    
    if (!membership) {
      return res.status(404).json({
        error: 'Membership not found',
        message: 'You are not a member of this group',
      });
    }
    
    // Prevent creator from leaving if there are other members
    if (membership.role === 'CREATOR' && membership.group._count.members > 1) {
      return res.status(400).json({
        error: 'Cannot leave group',
        message: 'Group creators must transfer ownership or delete the group before leaving',
      });
    }
    
    // If creator is leaving and they're the only member, delete the group
    if (membership.role === 'CREATOR' && membership.group._count.members === 1) {
      await prisma.group.update({
        where: { id: groupId },
        data: { isActive: false },
      });
    }
    
    // Remove membership
    await prisma.groupMember.delete({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });
    
    res.json({
      success: true,
      message: 'Successfully left group',
    });
    
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({
      error: 'Failed to leave group',
      message: error.message,
    });
  }
};

/**
 * Get group members
 */
const getGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
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
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group',
      });
    }
    
    // Get all group members
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
            topSpeed: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' }, // Creators first, then admins, then members
        { joinedAt: 'asc' },
      ],
    });
    
    // Add online status and current journey info
    const membersWithStatus = members.map(member => ({
      ...member,
      isOnline: member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000, // 5 minutes
      isCurrentUser: member.userId === userId,
    }));
    
    res.json({
      success: true,
      members: membersWithStatus,
      totalMembers: members.length,
    });
    
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      error: 'Failed to get group members',
      message: error.message,
    });
  }
};

/**
 * Remove member from group (admin/creator only)
 */
const removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;
    
    // Verify user is creator or admin
    const userMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });
    
    if (!userMembership || !['CREATOR', 'ADMIN'].includes(userMembership.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only group creators and admins can remove members',
      });
    }
    
    // Cannot remove yourself
    if (memberId === userId) {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'Cannot remove yourself. Use leave group instead',
      });
    }
    
    // Get target member
    const targetMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: memberId,
          groupId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });
    
    if (!targetMembership) {
      return res.status(404).json({
        error: 'Member not found',
        message: 'Member not found in this group',
      });
    }
    
    // Creators cannot be removed by admins
    if (targetMembership.role === 'CREATOR' && userMembership.role !== 'CREATOR') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Cannot remove group creator',
      });
    }
    
    // Remove member
    await prisma.groupMember.delete({
      where: {
        userId_groupId: {
          userId: memberId,
          groupId,
        },
      },
    });
    
    res.json({
      success: true,
      message: `${targetMembership.user.displayName} has been removed from the group`,
    });
    
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      error: 'Failed to remove member',
      message: error.message,
    });
  }
};

/**
 * Add creator as member (fix for missing creator membership)
 */
const addCreatorAsMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Get group
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        error: 'Group not found',
      });
    }

    // Verify user is the creator
    if (group.creatorId !== userId) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Only the group creator can perform this action',
      });
    }

    // Check if already a member
    const existing = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: { userId, groupId },
      },
    });

    if (existing) {
      return res.json({
        success: true,
        message: 'Already a member',
      });
    }

    // Add as member with CREATOR role
    await prisma.groupMember.create({
      data: {
        userId,
        groupId,
        role: 'CREATOR',
      },
    });

    res.json({
      success: true,
      message: 'Creator added as member',
    });
  } catch (error) {
    console.error('Add creator member error:', error);
    res.status(500).json({
      error: 'Failed to add creator as member',
      message: error.message,
    });
  }
};

module.exports = {
  createGroup,
  joinGroup,
  getGroup,
  getUserGroups,
  updateGroup,
  leaveGroup,
  getGroupMembers,
  removeMember,
  addCreatorAsMember,
};

/**
 * Upload group cover image (creator/admin only)
 * Field: 'cover' (multipart/form-data)
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
}).single('cover');

const uploadGroupCover = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Verify membership and role
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership || !['CREATOR', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only group creators and admins can update the cover image',
      });
    }

    // Handle upload via multer
    upload(req, res, async (err) => {
      if (err) {
        console.error('[Group Cover] Upload error:', err.message);
        return res.status(400).json({ error: 'Upload error', message: err.message });
      }
      if (!req.file) {
        console.error('[Group Cover] No file in request');
        return res.status(400).json({ error: 'No file uploaded', message: 'Please provide an image file' });
      }

      try {
        console.log(`[Group Cover] Processing upload for group ${groupId}`);
        console.log(`[Group Cover] Original file: ${req.file.originalname}, size: ${req.file.size} bytes`);

        // Get existing group to check for old cover photo
        const existingGroup = await prisma.group.findUnique({
          where: { id: groupId },
          select: { coverPhotoURL: true },
        });

        // Process image to a reasonable cover size (1200x600 for cover)
        const optimized = await sharp(req.file.buffer)
          .resize(1200, 600, { fit: 'cover' })
          .jpeg({ quality: 88, progressive: true })
          .toBuffer();

        console.log(`[Group Cover] Image optimized: ${optimized.length} bytes`);

        const filename = `cover_${groupId}_${Date.now()}.jpg`;
        const imageUrl = await uploadToStorage(optimized, filename, 'image/jpeg', 'group-covers');

        console.log(`[Group Cover] Upload successful: ${imageUrl}`);

        // Delete old cover photo if it exists
        if (existingGroup?.coverPhotoURL) {
          try {
            console.log(`[Group Cover] Deleting old cover: ${existingGroup.coverPhotoURL}`);
            await deleteFromStorage(existingGroup.coverPhotoURL);
            console.log('[Group Cover] Old cover deleted successfully');
          } catch (deleteErr) {
            console.error('[Group Cover] Failed to delete old cover:', deleteErr.message);
            // Don't fail the upload if old photo deletion fails
          }
        }

        // Update group with cover photo URL
        await prisma.group.update({
          where: { id: groupId },
          data: { coverPhotoURL: imageUrl },
        });

        console.log(`[Group Cover] Group ${groupId} updated with new cover URL`);
        return res.json({ success: true, imageUrl });
      } catch (processingError) {
        console.error('[Group Cover] Processing error:', processingError);
        return res.status(500).json({ 
          error: 'Failed to process cover image', 
          message: processingError.message 
        });
      }
    });
  } catch (error) {
    console.error('Upload group cover error:', error);
    res.status(500).json({ error: 'Failed to upload group cover', message: error.message });
  }
};

module.exports.uploadGroupCover = uploadGroupCover;