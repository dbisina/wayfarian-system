// Authentication Middleware
// server/middleware/auth.js

const { verifyIdToken } = require('../services/Firebase');
const prisma = require('../prisma/client');
const logger = require('../services/Logger');
const { cacheService } = require('../services/CacheService');

// Token blacklist cache
const TOKEN_BLACKLIST_KEY = 'token_blacklist';

/**
 * Check if token is blacklisted
 */
const isTokenBlacklisted = async (token) => {
  try {
    const blacklisted = await cacheService.get(`${TOKEN_BLACKLIST_KEY}:${token}`);
    return !!blacklisted;
  } catch (error) {
    logger.error('Token blacklist check failed', { error: error.message });
    return false;
  }
};

/**
 * Blacklist a token
 */
const blacklistToken = async (token, expiresIn = 3600) => {
  try {
    await cacheService.set(`${TOKEN_BLACKLIST_KEY}:${token}`, '1', expiresIn);
  } catch (error) {
    logger.error('Token blacklist failed', { error: error.message });
  }
};

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

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      logger.security('Blacklisted token attempt', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({
        error: 'Token revoked',
        message: 'This token has been revoked. Please sign in again.',
      });
    }

    let decodedToken;
    try {
      decodedToken = await verifyIdToken(token);
    } catch (firebaseError) {
      logger.security('Firebase token verification failed', {
        error: firebaseError.message,
        ip: req.ip,
      });
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
      logger.error('Auth DB lookup failed', { error: dbErr.message });
      return res.status(500).json({ error: 'Authentication failed', message: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User account not found in database',
      });
    }

    req.user = user;
    req.authToken = token; // Store token for potential blacklisting
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message });
    return res.status(500).json({
      error: 'Authentication failed',
      message: 'Internal server error',
    });
  }
};

module.exports = authMiddleware;
module.exports.blacklistToken = blacklistToken;
module.exports.isTokenBlacklisted = isTokenBlacklisted;

