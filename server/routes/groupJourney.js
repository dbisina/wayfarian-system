// server/routes/groupJourney.js
// Group Journey Routes

const express = require('express');
const { body, param, validationResult } = require('express-validator');
// Using V2 controller with Redis caching and fixed design
const {
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
  getGroupJourneySummary,
  adminEndJourney,
} = require('../controllers/groupJourneyControllerV2');
const {
  createRideEvent,
  listRideEvents,
} = require('../controllers/rideEventController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route POST /api/group-journey/start
 * @desc Start a new group journey (creator sets destination only)
 * @access Private (Creator/Admin only)
 */
router.post(
  '/start',
  [
    body('groupId')
      .isString()
      .notEmpty()
      .withMessage('Group ID is required'),
    body('title')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be 1-100 characters'),
    body('description')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Description max 500 characters'),
    body('endLatitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid destination latitude required'),
    body('endLongitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid destination longitude required'),
  ],
  handleValidationErrors,
  startGroupJourney
);

/**
 * @route POST /api/group-journey/:groupJourneyId/start-my-instance
 * @desc Member starts their individual journey instance from their location
 * @access Private (Group members only)
 */
router.post(
  '/:groupJourneyId/start-my-instance',
  [
    param('groupJourneyId')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required'),
    body('startLatitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid start latitude required'),
    body('startLongitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid start longitude required'),
  ],
  handleValidationErrors,
  startMyInstance
);

/**
 * @route GET /api/group-journey/active/:groupId
 * @desc Get the active group journey for a group (if any)
 * @access Private (Group members only)
 */
router.get(
  '/active/:groupId',
  [
    param('groupId')
      .isString()
      .notEmpty()
      .withMessage('Valid group ID required')
  ],
  handleValidationErrors,
  getActiveForGroup
);

/**
 * @route GET /api/group-journey/my-active-instance
 * @desc Get current user's active or paused group journey instance
 * @access Private
 * NOTE: Must be defined BEFORE /:id to avoid Express matching 'my-active-instance' as an :id param
 */
router.get(
  '/my-active-instance',
  getMyActiveInstance
);

/**
 * @route GET /api/group-journey/:id/summary
 * @desc Get post-ride group journey summary with aggregated stats
 * @access Private (Group members only)
 */
router.get(
  '/:id/summary',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required')
  ],
  handleValidationErrors,
  getGroupJourneySummary
);

/**
 * @route POST /api/group-journey/:id/end
 * @desc Admin soft-end a group journey (marks COMPLETED, does not modify instances)
 * @access Private (Group creator/admin only)
 */
router.post(
  '/:id/end',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required')
  ],
  handleValidationErrors,
  adminEndJourney
);

/**
 * @route GET /api/group-journey/:id
 * @desc Get group journey details with all instances
 * @access Private (Group members only)
 */
router.get(
  '/:id',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required')
  ],
  handleValidationErrors,
  getGroupJourney
);

/**
 * @route GET /api/group-journey/:groupJourneyId/my-instance
 * @desc Get user's instance for a group journey
 * @access Private
 */
router.get(
  '/:groupJourneyId/my-instance',
  [
    param('groupJourneyId')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required')
  ],
  handleValidationErrors,
  getMyInstance
);

/**
 * @route GET /api/group-journey/active/:groupId
 * @desc Get the active group journey for a group (if any)
 * @access Private (Group members only)
 */
// (moved above to avoid being shadowed by '/:id')

/**
 * @route POST /api/group-journey/:id/join
 * @desc Join an active group journey (create instance if missing)
 * @access Private (Group members only)
 */
router.post(
  '/:id/join',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required')
  ],
  handleValidationErrors,
  joinGroupJourney
);

/**
 * @route POST /api/group-journey/instance/:id/location
 * @desc Update journey instance location
 * @access Private (Instance owner only)
 */
router.post(
  '/instance/:id/location',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid instance ID required'),
    body('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude required'),
    body('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude required'),
    body('distance')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Distance must be positive'),
    body('speed')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Speed must be positive'),
    body('routePoint')
      .optional()
      .isObject()
      .withMessage('Route point must be an object')
  ],
  handleValidationErrors,
  updateInstanceLocation
);

/**
 * @route POST /api/group-journey/instance/:id/complete
 * @desc Complete a journey instance
 * @access Private (Instance owner only)
 */
router.post(
  '/instance/:id/complete',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid instance ID required'),
    body('endLatitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid end latitude required'),
    body('endLongitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid end longitude required')
  ],
  handleValidationErrors,
  completeInstance
);

/**
 * @route POST /api/group-journey/instance/:id/pause
 * @desc Pause a journey instance
 * @access Private (Instance owner only)
 */
router.post(
  '/instance/:id/pause',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid instance ID required')
  ],
  handleValidationErrors,
  pauseInstance
);

/**
 * @route POST /api/group-journey/instance/:id/resume
 * @desc Resume a journey instance
 * @access Private (Instance owner only)
 */
router.post(
  '/instance/:id/resume',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid instance ID required')
  ],
  handleValidationErrors,
  resumeInstance
);

// Removed cancel endpoint per product decision: journeys should be paused/resumed, not cancelled

/**
 * @route GET /api/group-journey/:id/events
 * @desc List ride events for a group journey (timeline)
 * @access Private (Group members only)
 */
router.get(
  '/:id/events',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required'),
  ],
  handleValidationErrors,
  listRideEvents
);

/**
 * @route POST /api/group-journey/:id/events
 * @desc Create a ride event (message/checkpoint/photo reference)
 * @access Private (Participants)
 */
router.post(
  '/:id/events',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required'),
    body('type')
      .isString()
      .notEmpty()
      .withMessage('Event type is required'),
    body('message')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Message max 500 characters'),
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude required'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude required'),
    body('mediaUrl')
      .optional()
      .isString()
      .isLength({ max: 2048 })
      .withMessage('mediaUrl too long'),
  ],
  handleValidationErrors,
  createRideEvent
);

module.exports = router;
