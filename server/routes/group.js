// Group Routes
// server/routes/group.js

const express = require('express');
const router = express.Router();
const {
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupDetails,
  getUserGroups,
  updateGroup,
  deleteGroup,
  getGroupMembers
} = require('../controllers/groupController');
const { body, param, query, validationResult } = require('express-validator');

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
router.post('/create',
  [
    body('name').notEmpty().isLength({ min: 2, max: 50 }),
    body('description').optional().isLength({ max: 200 }),
    body('maxMembers').optional().isInt({ min: 2, max: 50 }),
    body('isPrivate').optional().isBoolean(),
  ],
  handleValidationErrors,
  createGroup
);

/**
 * @route POST /api/group/join
 * @desc Join a group using code
 * @access Private
 */
router.post('/join',
  [
    body('code').notEmpty().isLength({ min: 6, max: 6 }),
  ],
  handleValidationErrors,
  joinGroup
);

/**
 * @route POST /api/group/:groupId/leave
 * @desc Leave a group
 * @access Private
 */
router.post('/:groupId/leave',
  [param('groupId').isUUID()],
  handleValidationErrors,
  leaveGroup
);

/**
 * @route GET /api/group/my-groups
 * @desc Get user's groups
 * @access Private
 */
router.get('/my-groups', getUserGroups);

/**
 * @route GET /api/group/:groupId
 * @desc Get group details
 * @access Private
 */
router.get('/:groupId',
  [param('groupId').isUUID()],
  handleValidationErrors,
  getGroupDetails
);

/**
 * @route GET /api/group/:groupId/members
 * @desc Get group members
 * @access Private
 */
router.get('/:groupId/members',
  [param('groupId').isUUID()],
  handleValidationErrors,
  getGroupMembers
);

/**
 * @route PUT /api/group/:groupId
 * @desc Update group details
 * @access Private (Creator/Admin only)
 */
router.put('/:groupId',
  [
    param('groupId').isUUID(),
    body('name').optional().isLength({ min: 2, max: 50 }),
    body('description').optional().isLength({ max: 200 }),
    body('maxMembers').optional().isInt({ min: 2, max: 50 }),
    body('isPrivate').optional().isBoolean(),
  ],
  handleValidationErrors,
  updateGroup
);

/**
 * @route DELETE /api/group/:groupId
 * @desc Delete a group
 * @access Private (Creator only)
 */
router.delete('/:groupId',
  [param('groupId').isUUID()],
  handleValidationErrors,
  deleteGroup
);

module.exports = router;