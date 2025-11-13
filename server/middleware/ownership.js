// Ownership and Authorization Middleware
// server/middleware/ownership.js

const prisma = require('../prisma/client');
const logger = require('../services/Logger');

/**
 * Verify user owns the resource they're trying to access
 */
const verifyOwnership = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Check for user ID in params
    if (req.params.userId && req.params.userId !== userId) {
      logger.security('IDOR attempt detected', {
        userId,
        attemptedUserId: req.params.userId,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource'
      });
    }

    // Check for user ID in body
    if (req.body.userId && req.body.userId !== userId) {
      logger.security('IDOR attempt detected in request body', {
        userId,
        attemptedUserId: req.body.userId,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource'
      });
    }

    // Check for user ID in query
    if (req.query.userId && req.query.userId !== userId) {
      logger.security('IDOR attempt detected in query params', {
        userId,
        attemptedUserId: req.query.userId,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  } catch (error) {
    logger.error('Ownership verification error', { error: error.message });
    res.status(500).json({
      error: 'Authorization failed',
      message: error.message
    });
  }
};

/**
 * Verify user is member of the group they're trying to access
 */
const verifyGroupMembership = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    if (!groupId) {
      return next();
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
      }
    });

    if (!membership) {
      logger.security('Unauthorized group access attempt', {
        userId,
        groupId,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group'
      });
    }

    req.groupMembership = membership;
    next();
  } catch (error) {
    logger.error('Group membership verification error', { error: error.message });
    res.status(500).json({
      error: 'Authorization failed',
      message: error.message
    });
  }
};

/**
 * Verify user owns the journey they're trying to access
 */
const verifyJourneyOwnership = async (req, res, next) => {
  try {
    const { journeyId } = req.params;
    const userId = req.user.id;

    if (!journeyId) {
      return next();
    }

    const journey = await prisma.journey.findUnique({
      where: { id: journeyId },
      select: { userId: true }
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
        message: 'The specified journey does not exist'
      });
    }

    if (journey.userId !== userId) {
      logger.security('Unauthorized journey access attempt', {
        userId,
        journeyId,
        journeyOwner: journey.userId,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not own this journey'
      });
    }

    next();
  } catch (error) {
    logger.error('Journey ownership verification error', { error: error.message });
    res.status(500).json({
      error: 'Authorization failed',
      message: error.message
    });
  }
};

/**
 * Verify user owns the photo they're trying to access
 */
const verifyPhotoOwnership = async (req, res, next) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;

    if (!photoId) {
      return next();
    }

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: { userId: true }
    });

    if (!photo) {
      return res.status(404).json({
        error: 'Photo not found',
        message: 'The specified photo does not exist'
      });
    }

    if (photo.userId !== userId) {
      logger.security('Unauthorized photo access attempt', {
        userId,
        photoId,
        photoOwner: photo.userId,
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not own this photo'
      });
    }

    next();
  } catch (error) {
    logger.error('Photo ownership verification error', { error: error.message });
    res.status(500).json({
      error: 'Authorization failed',
      message: error.message
    });
  }
};

/**
 * Validate user is group member with specific role
 */
const requireGroupRole = (allowedRoles = ['CREATOR', 'ADMIN', 'MEMBER']) => {
  return async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.id;

      if (!groupId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Group ID is required',
        });
      }

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
          error: 'Forbidden',
          message: 'You are not a member of this group',
        });
      }

      if (!allowedRoles.includes(membership.role)) {
        logger.security('Group role validation failed', {
          groupId,
          userId,
          userRole: membership.role,
          requiredRoles: allowedRoles,
          ip: req.ip,
        });

        return res.status(403).json({
          error: 'Forbidden',
          message: `Required role: ${allowedRoles.join(' or ')}`,
        });
      }

      req.groupMembership = membership;
      next();
    } catch (error) {
      logger.error('Group role validation error', {
        error: error.message,
        groupId: req.params.groupId,
        userId: req.user.id,
      });

      res.status(500).json({
        error: 'Validation Error',
        message: 'Failed to validate group permissions',
      });
    }
  };
};

/**
 * Validate user can access journey (owner or group member)
 */
const requireJourneyAccess = async (req, res, next) => {
  try {
    const { journeyId } = req.params;
    const userId = req.user.id;

    if (!journeyId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Journey ID is required',
      });
    }

    const journey = await prisma.journey.findFirst({
      where: {
        id: journeyId,
        OR: [
          { userId: userId }, // User owns the journey
          {
            group: {
              members: {
                some: { userId: userId },
              },
            },
          }, // User is member of journey's group
        ],
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            allowLocationSharing: true,
          },
        },
      },
    });

    if (!journey) {
      logger.security('Journey access validation failed', {
        journeyId,
        userId,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this journey',
      });
    }

    req.journey = journey;
    next();
  } catch (error) {
    logger.error('Journey access validation error', {
      error: error.message,
      journeyId: req.params.journeyId,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Validation Error',
      message: 'Failed to validate journey access',
    });
  }
};

/**
 * Validate user can access photo (owner or group member)
 */
const requirePhotoAccess = async (req, res, next) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;

    if (!photoId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Photo ID is required',
      });
    }

    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        OR: [
          { userId: userId }, // User owns the photo
          {
            journey: {
              OR: [
                { userId: userId }, // User owns the journey
                {
                  group: {
                    members: {
                      some: { userId: userId },
                    },
                  },
                }, // User is member of journey's group
              ],
            },
          },
        ],
      },
      include: {
        journey: {
          select: {
            id: true,
            userId: true,
            groupId: true,
          },
        },
      },
    });

    if (!photo) {
      logger.security('Photo access validation failed', {
        photoId,
        userId,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this photo',
      });
    }

    req.photo = photo;
    next();
  } catch (error) {
    logger.error('Photo access validation error', {
      error: error.message,
      photoId: req.params.photoId,
      userId: req.user.id,
    });

    res.status(500).json({
      error: 'Validation Error',
      message: 'Failed to validate photo access',
    });
  }
};

/**
 * Rate limiting by user ID for authenticated endpoints
 */
const userRateLimit = (windowMs, max, message) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    keyGenerator: (req) => {
      return req.user?.id || req.ip; // Use user ID for authenticated users, IP for others
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.security('User rate limit exceeded', {
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        path: req.path,
      });
      res.status(429).json({
        error: 'Too many requests',
        message,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};

module.exports = {
  verifyOwnership,
  verifyGroupMembership,
  verifyJourneyOwnership,
  verifyPhotoOwnership,
  requireGroupRole,
  requireJourneyAccess,
  requirePhotoAccess,
  userRateLimit
};