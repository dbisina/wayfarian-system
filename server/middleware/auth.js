// Authentication Middleware
// server/middleware/auth.js

const { verifyIdToken } = require('../services/Firebase');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Middleware to verify Firebase token and attach user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Authorization header missing',
        message: 'Please provide a valid token',
      });
    }
    
    const token = authHeader.split(' ')[1]; // Bearer <token>
    
    if (!token) {
      return res.status(401).json({
        error: 'Token missing',
        message: 'Please provide a valid token',
      });
    }
    
    // Verify Firebase token
    const decodedToken = await verifyIdToken(token);
    
    // Get or create user in database
    let user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });
    
    if (!user) {
      // Create new user if doesn't exist
      user = await prisma.user.create({
        data: {
          firebaseUid: decodedToken.uid,
          email: decodedToken.email,
          phoneNumber: decodedToken.phone_number,
          displayName: decodedToken.name,
          photoURL: decodedToken.picture,
        },
      });
    }
    
    // Attach user to request
    req.user = user;
    req.firebaseUser = decodedToken;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Please login again',
    });
  }
};

module.exports = authMiddleware;

