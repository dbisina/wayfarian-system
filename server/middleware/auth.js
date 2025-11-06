// Authentication Middleware
// server/middleware/auth.js

const { verifyIdToken } = require('../services/Firebase');
const prisma = require('../prisma/client');

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

    // SECURITY: Check token expiration timestamp
    const now = Math.floor(Date.now() / 1000);
    if (decodedToken.exp && decodedToken.exp < now) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your authentication token has expired. Please sign in again.',
      });
    }

    // Optional: Check if token is too old (issued more than 1 hour ago as an extra safety measure)
    const TOKEN_MAX_AGE = parseInt(process.env.TOKEN_MAX_AGE_SECONDS) || 3600; // 1 hour default
    if (decodedToken.iat && (now - decodedToken.iat) > TOKEN_MAX_AGE) {
      return res.status(401).json({
        error: 'Token too old',
        message: 'Your authentication token is stale. Please refresh your session.',
      });
    }

    req.firebaseUser = decodedToken;
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
      });
    } catch (dbErr) {
      const msg = (dbErr && dbErr.message) || 'Database error';
      // Fast-fail for pool timeouts or DB unreachable instead of hanging ~10s
      if (msg.includes('Timed out fetching a new connection') || msg.includes("Can't reach database server")) {
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Database is temporarily unavailable. Please try again shortly.',
        });
      }
      console.error('Auth DB lookup failed:', dbErr);
      return res.status(500).json({ error: 'Authentication failed', message: 'Database error' });
    }

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

