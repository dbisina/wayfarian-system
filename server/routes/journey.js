// Journey Routes
// server/routes/journey.js

const express = require("express");
const prisma = require('../prisma/client');
const {
  createJourney,
  startJourney,
  updateJourneyProgress,
  endJourney,
  getJourneyHistory,
  getActiveJourney,
  pauseJourney,
  resumeJourney,
  forceClearJourney,
  updateJourneyPreferences,
  restoreHiddenJourneys,
  clearCustomJourneyTitles,
} = require("../controllers/journeyController");
const { body, param, query, validationResult } = require("express-validator");

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation Error",
      errors: errors.array(),
    });
  }
  next();
};

const coordinateValidator = (field, { allowOptionalForPlanned = false } = {}) => {
  const limits = field === 'latitude' ? { min: -90, max: 90 } : { min: -180, max: 180 };
  const friendlyName = field.charAt(0).toUpperCase() + field.slice(1);

  return body(field).custom((value, { req }) => {
    const rawStatus = req.body.status || 'ACTIVE';
    const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : 'ACTIVE';
    const isPlanned = normalizedStatus === 'PLANNED';
    const canSkip = allowOptionalForPlanned && isPlanned;

    if (value === undefined || value === null || value === '') {
      if (canSkip) {
        return true;
      }
      throw new Error(`${friendlyName} is required`);
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < limits.min || numericValue > limits.max) {
      throw new Error(
        field === 'latitude'
          ? 'Latitude must be between -90 and 90'
          : 'Longitude must be between -180 and 180'
      );
    }

    // Persist the parsed value so downstream logic works with numbers
    req.body[field] = numericValue;
    return true;
  });
};

/**
 * @route POST /api/journey/create
 * @desc Create a new journey (draft or planned)
 * @access Private
 */
router.post(
  "/create",
  [
    coordinateValidator('latitude', { allowOptionalForPlanned: true }),
    coordinateValidator('longitude', { allowOptionalForPlanned: true }),
    body("title")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Title must be between 1 and 100 characters"),
    body("vehicle")
      .optional()
      .isIn(["bike", "car", "truck", "motorcycle", "bus", "other"])
      .withMessage("Invalid vehicle type"),
    body("status")
      .optional()
      .isIn(["ACTIVE", "PLANNED"])
      .withMessage("Invalid status"),
    body("startTime")
      .optional()
      .isISO8601()
      .withMessage("Invalid start time"),
  ],
  handleValidationErrors,
  createJourney
);

/**
 * @route POST /api/journey/start
 * @desc Start a new journey
 * @access Private
 */
router.post(
  "/start",
  [
    coordinateValidator('latitude'),
    coordinateValidator('longitude'),
    body("title")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Title must be between 1 and 100 characters"),
    body("vehicle")
      .optional()
      .isIn(["bike", "car", "truck", "motorcycle", "bus", "other"])
      .withMessage("Invalid vehicle type"),
    // groupId is truly optional - solo journeys don't have a group
    body("groupId")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .withMessage("Invalid group ID"),
  ],
  handleValidationErrors,
  startJourney
);

/**
 * @route PUT /api/journey/:journeyId/progress
 * @desc Update journey progress with GPS data
 * @access Private
 */
router.put(
  "/:journeyId/progress",
  [
  // IDs are Prisma CUID strings, not UUID
  param("journeyId").isString().withMessage("Invalid journey ID"),
    body("latitude")
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),
    body("longitude")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),
    body("speed")
      .optional()
      .isFloat({ min: 0, max: 500 })
      .withMessage("Speed must be between 0 and 500 km/h"),
    body("timestamp")
      .optional()
      .isISO8601()
      .withMessage("Invalid timestamp format"),
  ],
  handleValidationErrors,
  updateJourneyProgress
);

/**
 * @route PUT /api/journey/:journeyId/end
 * @desc End/Complete journey
 * @access Private
 */
router.put(
  "/:journeyId/end",
  [
  // IDs are Prisma CUID strings, not UUID
  param("journeyId").isString().withMessage("Invalid journey ID"),
    body("latitude")
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),
    body("longitude")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),
  ],
  handleValidationErrors,
  endJourney
);

/**
 * @route POST /api/journey/:journeyId/pause
 * @desc Pause an active journey
 * @access Private
 */
router.post(
  "/:journeyId/pause",
  [
    // IDs are Prisma CUID strings, not UUID
    param("journeyId").isString().withMessage("Invalid journey ID"),
  ],
  handleValidationErrors,
  pauseJourney
);

/**
 * @route POST /api/journey/:journeyId/resume
 * @desc Resume a paused journey
 * @access Private
 */
router.post(
  "/:journeyId/resume",
  [
    // IDs are Prisma CUID strings, not UUID
    param("journeyId").isString().withMessage("Invalid journey ID"),
  ],
  handleValidationErrors,
  resumeJourney
);

/**
 * @route POST /api/journey/:journeyId/start
 * @desc Start a planned or ready-to-start journey
 * @access Private
 */
router.post(
  "/:journeyId/start",
  [
    param("journeyId").isString().withMessage("Invalid journey ID"),
    body("latitude")
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),
    body("longitude")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { journeyId } = req.params;
      const userId = req.user.id;
      const { latitude, longitude } = req.body;

      // Find the journey
      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
          status: { in: ['PLANNED', 'READY_TO_START'] },
        },
      });

      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Journey not found or not in PLANNED/READY_TO_START status',
        });
      }

      // Check for existing active journey
      const activeJourney = await prisma.journey.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
        },
      });

      if (activeJourney) {
        return res.status(400).json({
          error: 'Active journey exists',
          message: 'Please end your current journey before starting a new one',
          activeJourneyId: activeJourney.id,
        });
      }

      // Update journey to ACTIVE
      const updateData = {
        status: 'ACTIVE',
        startTime: new Date(),
      };

      // Update start location if provided
      if (latitude !== undefined && longitude !== undefined) {
        updateData.startLatitude = latitude;
        updateData.startLongitude = longitude;
        updateData.routePoints = [{
          lat: latitude,
          lng: longitude,
          timestamp: new Date().toISOString(),
          speed: 0,
        }];
      }

      const updatedJourney = await prisma.journey.update({
        where: { id: journeyId },
        data: updateData,
      });

      res.json({
        success: true,
        message: 'Journey started successfully',
        journey: updatedJourney,
      });
    } catch (error) {
      console.error('Start planned journey error:', error);
      res.status(500).json({
        error: 'Failed to start journey',
        message: error.message,
      });
    }
  }
);

/**
 * @route DELETE /api/journey/:journeyId/force-clear
 * @desc Force clear/delete a stuck journey (any status)
 * @access Private
 */
router.delete(
  "/:journeyId/force-clear",
  [
    param("journeyId").isString().withMessage("Invalid journey ID"),
  ],
  handleValidationErrors,
  forceClearJourney
);

/**
 * @route DELETE /api/journey/:journeyId
 * @desc Delete a journey (only completed, cancelled, or planned journeys)
 * @access Private
 */
router.delete(
  "/:journeyId",
  [
    param("journeyId").isString().withMessage("Invalid journey ID"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { journeyId } = req.params;
      const userId = req.user.id;

      // Find the journey
      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
        },
        include: {
          photos: true,
        },
      });

      if (!journey) {
        return res.status(404).json({
          error: 'Journey not found',
          message: 'Journey not found or does not belong to you',
        });
      }

      // Prevent deletion of active journeys
      if (journey.status === 'ACTIVE') {
        return res.status(400).json({
          error: 'Cannot delete active journey',
          message: 'Please end the journey first before deleting it',
        });
      }

      // Delete photos first (to avoid FK constraints)
      // Note: Journey.photos refers to the Photo model, not JourneyPhoto
      if (journey.photos && journey.photos.length > 0) {
        await prisma.photo.deleteMany({
          where: { journeyId },
        });
      }

      // Delete the journey
      await prisma.journey.delete({
        where: { id: journeyId },
      });

      res.json({
        success: true,
        message: 'Journey deleted successfully',
      });
    } catch (error) {
      console.error('Delete journey error:', error);
      res.status(500).json({
        error: 'Failed to delete journey',
        message: error.message,
      });
    }
  }
);

/**
 * @route PATCH /api/journey/:journeyId/preferences
 * @desc Update journey visibility and custom title
 * @access Private
 */
router.patch(
  "/:journeyId/preferences",
  [
    param("journeyId").isString().withMessage("Invalid journey ID"),
    body("customTitle")
      .optional({ nullable: true })
      .isLength({ min: 0, max: 60 })
      .withMessage("Custom title must be 60 characters or fewer"),
    body("isHidden")
      .optional()
      .isBoolean()
      .withMessage("Hidden flag must be boolean")
      .toBoolean(),
  ],
  handleValidationErrors,
  updateJourneyPreferences
);

/**
 * @route POST /api/journey/restore-hidden
 * @desc Restore all hidden journeys for current user
 * @access Private
 */
router.post("/restore-hidden", restoreHiddenJourneys);

/**
 * @route POST /api/journey/clear-custom-titles
 * @desc Clear custom titles for all journeys
 * @access Private
 */
router.post("/clear-custom-titles", clearCustomJourneyTitles);

/**
 * @route GET /api/journey/history
 * @desc Get user's journey history
 * @access Private
 */
router.get(
  "/history",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("status")
      .optional()
      .isIn(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "PLANNED", "READY_TO_START"])
      .withMessage("Invalid status"),
  ],
  handleValidationErrors,
  getJourneyHistory
);

/**
 * @route GET /api/journey/active
 * @desc Get current active journey
 * @access Private
 */
router.get("/active", getActiveJourney);

/**
 * @route GET /api/journey/:journeyId
 * @desc Get specific journey details
 * @access Private
 */
router.get(
  "/:journeyId",
  [
    // IDs are Prisma CUID strings, not UUID
    param("journeyId").isString().withMessage("Invalid journey ID"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { journeyId } = req.params;
      const userId = req.user.id;

      

      const journey = await prisma.journey.findFirst({
        where: {
          id: journeyId,
          userId,
        },
        include: {
          group: {
            select: { id: true, name: true },
          },
          photos: {
            select: {
              id: true,
              filename: true,
              firebasePath: true,
              latitude: true,
              longitude: true,
              takenAt: true,
            },
            orderBy: { takenAt: "desc" },
          },
        },
      });

      if (!journey) {
        return res.status(404).json({
          error: "Journey not found",
          message: "Journey not found for this user",
        });
      }

      res.json({
        success: true,
        journey,
      });
    } catch (error) {
      console.error("Get journey error:", error);
      res.status(500).json({
        error: "Failed to get journey",
        message: error.message,
      });
    }
  }
);

module.exports = router;
