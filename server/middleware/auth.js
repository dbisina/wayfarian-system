// Authentication Middleware
// server/middleware/auth.js

const { verifyIdToken } = require('../services/Firebase');
const { PrismaClient } = require('@prisma/client');

/**
 * Middleware to verify Firebase token and attach user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    const token = authHeader.substring(7);

    let decodedToken;
    try {
      decodedToken = await verifyIdToken(token);
    } catch (firebaseError) {
      console.error('Firebase token verification failed:', firebaseError);
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The authentication token is invalid or expired',
      });
    }

    req.firebaseUser = decodedToken;

    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User account not found in database',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
    });
  }
};

module.exports = authMiddleware;

