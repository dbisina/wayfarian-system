// Journey Routes
// server/routes/journey.js

const express = require("express");
const {
  startJourney,
  updateJourneyProgress,
  endJourney,
  getJourneyHistory,
  getActiveJourney,
  pauseJourney,
  resumeJourney,
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

/**
 * @route POST /api/journey/start
 * @desc Start a new journey
 * @access Private
 */
router.post(
  "/start",
  [
    body("latitude")
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),
    body("longitude")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),
    body("title")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Title must be between 1 and 100 characters"),
    body("vehicle")
      .optional()
      .isIn(["bike", "car", "truck", "motorcycle", "bus", "other"])
      .withMessage("Invalid vehicle type"),
    body("groupId").optional().isUUID().withMessage("Invalid group ID"),
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
    param("journeyId").isUUID().withMessage("Invalid journey ID"),
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
    param("journeyId").isUUID().withMessage("Invalid journey ID"),
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
  [param("journeyId").isUUID().withMessage("Invalid journey ID")],
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
  [param("journeyId").isUUID().withMessage("Invalid journey ID")],
  handleValidationErrors,
  resumeJourney
);

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
      .isIn(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"])
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
  [param("journeyId").isUUID().withMessage("Invalid journey ID")],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { journeyId } = req.params;
      const userId = req.user.id;

      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

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
