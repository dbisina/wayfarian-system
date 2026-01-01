// Group Routes
// server/routes/group.js

const express = require('express');
const prisma = require('../prisma/client');
const { body, param, query, validationResult } = require('express-validator');
const {
  createGroup,
  joinGroup,
  getGroup,
  getUserGroups,
  updateGroup,
  leaveGroup,
  getGroupMembers,
  removeMember,
  uploadGroupCover,
  addCreatorAsMember,
} = require('../controllers/groupController');
const multer = require('multer');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * @route POST /api/group/create
 * @desc Create a new group
 * @access Private
 */
router.post(
  '/create',
  [
    body('name')
      .isLength({ min: 1, max: 50 })
      .withMessage('Group name must be between 1 and 50 characters'),
    body('description')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Description must be less than 200 characters'),
    body('maxMembers')
      .optional()
      .isInt({ min: 2, max: 50 })
      .withMessage('Max members must be between 2 and 50'),
    body('isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),
    body('allowLocationSharing')
      .optional()
      .isBoolean()
      .withMessage('allowLocationSharing must be a boolean'),
  ],
  handleValidationErrors,
  createGroup
);

/**
 * @route POST /api/group/join
 * @desc Join a group using invite code
 * @access Private
 */
router.post(
  '/join',
  [
    body('code')
      .isLength({ min: 6, max: 6 })
      .withMessage('Group code must be exactly 6 characters'),
  ],
  handleValidationErrors,
  joinGroup
);

/**
 * @route GET /api/group/my-groups
 * @desc Get user's groups
 * @access Private
 */
router.get(
  '/my-groups',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('status')
      .optional()
      .isIn(['active', 'all'])
      .withMessage('Status must be active or all'),
  ],
  handleValidationErrors,
  getUserGroups
);

/**
 * @route GET /api/group/:groupId
 * @desc Get group details
 * @access Private
 */
router.get(
  '/:groupId',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  getGroup
);

/**
 * @route PUT /api/group/:groupId
 * @desc Update group settings
 * @access Private (Creator/Admin only)
 */
router.put(
  '/:groupId',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
    body('name')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Group name must be between 1 and 50 characters'),
    body('description')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Description must be less than 200 characters'),
    body('maxMembers')
      .optional()
      .isInt({ min: 2, max: 50 })
      .withMessage('Max members must be between 2 and 50'),
    body('isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),
    body('allowLocationSharing')
      .optional()
      .isBoolean()
      .withMessage('allowLocationSharing must be a boolean'),
  ],
  handleValidationErrors,
  updateGroup
);

/**
 * @route DELETE /api/group/:groupId
 * @desc Delete a group (Creator only)
 * @access Private
 */
router.delete(
  '/:groupId',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;

      // Check if group exists and user is the creator
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: true,
          _count: { select: { journeys: true } }
        }
      });

      if (!group) {
        return res.status(404).json({
          error: 'Group not found',
          message: 'The group does not exist'
        });
      }

      if (group.creatorId !== userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the group creator can delete this group'
        });
      }

      // Check for active group journeys
      const activeJourney = await prisma.groupJourney.findFirst({
        where: {
          groupId,
          status: 'ACTIVE'
        }
      });

      if (activeJourney) {
        return res.status(400).json({
          error: 'Cannot delete group',
          message: 'Please end the active group journey before deleting the group'
        });
      }

      // Delete all related data in order
      // 1. Delete ride events for all group journeys
      await prisma.rideEvent.deleteMany({
        where: {
          groupJourney: { groupId }
        }
      });

      // 2. Delete journey instances for all group journeys  
      await prisma.journeyInstance.deleteMany({
        where: {
          groupJourney: { groupId }
        }
      });

      // 3. Delete all group journeys
      await prisma.groupJourney.deleteMany({
        where: { groupId }
      });

      // 4. Delete all group members
      await prisma.groupMember.deleteMany({
        where: { groupId }
      });

      // 5. Delete the group
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
  }
);

/**
 * @route DELETE /api/group/:groupId/leave
 * @desc Leave a group
 * @access Private
 */
router.delete(
  '/:groupId/leave',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  leaveGroup
);

/**
 * @route GET /api/group/:groupId/members
 * @desc Get group members
 * @access Private
 */
router.get(
  '/:groupId/members',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  getGroupMembers
);

/**
 * @route DELETE /api/group/:groupId/members/:memberId
 * @desc Remove member from group
 * @access Private (Creator/Admin only)
 */
router.delete(
  '/:groupId/members/:memberId',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
    param('memberId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid member ID'),
  ],
  handleValidationErrors,
  removeMember
);

/**
 * @route GET /api/group/:groupId/invite-link
 * @desc Get group invite link/code
 * @access Private (Members only)
 */
router.get(
  '/:groupId/invite-link',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  async (req, res) => {
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
        include: {
          group: {
            select: {
              id: true,
              name: true,
              code: true,
              isPrivate: true,
              maxMembers: true,
              _count: {
                select: { members: true },
              },
            },
          },
        },
      });
      
      if (!membership) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You are not a member of this group',
        });
      }
      
      const baseUrl = process.env.FRONTEND_URL || 'https://wayfarian.app';
      const inviteLink = `${baseUrl}/join-group?code=${membership.group.code}`;
      
      res.json({
        success: true,
        inviteLink,
        groupCode: membership.group.code,
        group: {
          id: membership.group.id,
          name: membership.group.name,
          memberCount: membership.group._count.members,
          maxMembers: membership.group.maxMembers,
          isPrivate: membership.group.isPrivate,
        },
      });
      
    } catch (error) {
      console.error('Get invite link error:', error);
      res.status(500).json({
        error: 'Failed to get invite link',
        message: error.message,
      });
    }
  }
);

/**
 * @route POST /api/group/:groupId/cover
 * @desc Upload group cover image (creator/admin only)
 * @access Private
 */
router.post(
  '/:groupId/cover',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  uploadGroupCover
);

/**
 * @route POST /api/group/:groupId/add-creator-member
 * @desc Add creator as member (fix for missing creator membership)
 * @access Private (Creator only)
 */
router.post(
  '/:groupId/add-creator-member',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  addCreatorAsMember
);

/**
 * @route POST /api/group/:groupId/regenerate-code
 * @desc Regenerate group invite code
 * @access Private (Creator/Admin only)
 */
router.post(
  '/:groupId/regenerate-code',
  [
    param('groupId')
      .isString()
      .isLength({ min: 20, max: 30 })
      .withMessage('Invalid group ID'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;
      
  const { generateRandomString } = require('../utils/helpers');
      
      
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
          message: 'Only group creators and admins can regenerate invite codes',
        });
      }
      
      // Generate new unique code
      let newCode;
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 5) {
        newCode = generateRandomString(6);
        const existingGroup = await prisma.group.findUnique({
          where: { code: newCode },
        });
        
        if (!existingGroup) {
          isUnique = true;
        }
        attempts++;
      }
      
      if (!isUnique) {
        return res.status(500).json({
          error: 'Failed to generate unique code',
          message: 'Please try again',
        });
      }
      
      // Update group with new code
      const updatedGroup = await prisma.group.update({
        where: { id: groupId },
        data: { code: newCode },
        select: {
          id: true,
          name: true,
          code: true,
        },
      });
      
      const baseUrl = process.env.FRONTEND_URL || 'https://wayfarian.app';
      const inviteLink = `${baseUrl}/join-group?code=${newCode}`;
      
      res.json({
        success: true,
        message: 'Group invite code regenerated successfully',
        newCode,
        inviteLink,
        group: updatedGroup,
      });
      
    } catch (error) {
      console.error('Regenerate code error:', error);
      res.status(500).json({
        error: 'Failed to regenerate code',
        message: error.message,
      });
    }
  }
);

module.exports = router;