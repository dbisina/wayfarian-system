// server/middleware/cache.js

const { cacheService } = require('../services/CacheService');

/**
 * Cache middleware factory
 * @param {number} ttl - Time to live in seconds (default: 300)
 * @param {Function} keyGenerator - Function to generate cache key from req
 * @param {Function} condition - Function to determine if response should be cached
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (ttl = 300, keyGenerator = null, condition = null) => {
  return (req, res, next) => {
    // Generate cache key
    const cacheKey = keyGenerator ? keyGenerator(req) : generateDefaultKey(req);
    
    // Try to get from cache
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      // Add cache headers
      res.set({
        'X-Cache': 'HIT',
        'X-Cache-Key': cacheKey,
        'Cache-Control': `max-age=${ttl}`,
      });
      
      return res.json(cachedData);
    }
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to cache response
    res.json = function(data) {
      // Check if response should be cached
      const shouldCache = condition ? condition(req, res, data) : shouldCacheDefault(req, res, data);
      
      if (shouldCache) {
        cacheService.set(cacheKey, data, ttl);
        
        // Add cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey,
          'Cache-Control': `max-age=${ttl}`,
        });
      } else {
        // Add no-cache headers
        res.set({
          'X-Cache': 'SKIP',
          'Cache-Control': 'no-cache',
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Generate default cache key from request
 * @param {object} req - Express request object
 * @returns {string} Cache key
 */
const generateDefaultKey = (req) => {
  const userId = req.user?.id || 'anonymous';
  const path = req.route?.path || req.path;
  const method = req.method;
  const query = JSON.stringify(req.query);
  const params = JSON.stringify(req.params);
  
  return `${method}:${path}:${userId}:${params}:${query}`;
};

/**
 * Default condition for caching responses
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {any} data - Response data
 * @returns {boolean} Should cache
 */
const shouldCacheDefault = (req, res, data) => {
  // Don't cache errors
  if (res.statusCode >= 400) {
    return false;
  }
  
  // Don't cache if response indicates failure
  if (data && data.success === false) {
    return false;
  }
  
  // Don't cache POST, PUT, DELETE requests by default
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return false;
  }
  
  return true;
};

/**
 * Cache invalidation middleware
 * Invalidates cache entries based on patterns
 * @param {string[]} patterns - Array of cache key patterns to invalidate
 * @returns {Function} Express middleware
 */
const invalidateCache = (patterns = []) => {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to invalidate cache after successful response
    res.json = function(data) {
      // Only invalidate if response is successful
      if (res.statusCode < 400 && data && data.success !== false) {
        for (const pattern of patterns) {
          const resolvedPattern = typeof pattern === 'function' ? pattern(req, data) : pattern;
          const deletedCount = cacheService.deletePattern(resolvedPattern);
          
          if (deletedCount > 0) {
            console.log(`Cache invalidated: ${deletedCount} entries for pattern "${resolvedPattern}"`);
          }
        }
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Leaderboard-specific cache middleware
 * @param {number} ttl - Time to live in seconds (default: 600)
 * @returns {Function} Express middleware
 */
const cacheLeaderboard = (ttl = 60) => {
  return cacheMiddleware(
    ttl,
    (req) => {
      const { sortBy = 'totalDistance', timeFrame = 'allTime', page = 1, limit = 50 } = req.query;
      const { groupId } = req.params;
      const userId = req.user.id;
      
      if (req.path.includes('/friends')) {
        return `leaderboard:friends:${userId}:${sortBy}:${timeFrame}`;
      } else if (groupId) {
        return `leaderboard:group:${groupId}:${sortBy}:${timeFrame}`;
      } else {
        return `leaderboard:global:${sortBy}:${timeFrame}:${page}:${limit}`;
      }
    }
  );
};

/**
 * User profile cache middleware
 * @param {number} ttl - Time to live in seconds (default: 300)
 * @returns {Function} Express middleware
 */
const cacheUserProfile = (ttl = 300) => {
  return cacheMiddleware(
    ttl,
    (req) => `user:profile:${req.user.id}:${req.path}`
  );
};

/**
 * Maps cache middleware
 * @param {number} ttl - Time to live in seconds (default: 1800)
 * @returns {Function} Express middleware
 */
const cacheMaps = (ttl = 1800) => {
  return cacheMiddleware(
    ttl,
    (req) => {
      const { latitude, longitude, type, radius, address, placeId } = req.query;
      
      if (req.path.includes('/nearby-places')) {
        return `maps:nearby:${latitude}:${longitude}:${type || 'poi'}:${radius || 5000}`;
      } else if (req.path.includes('/place-details')) {
        return `maps:place:${req.params.placeId}`;
      } else if (req.path.includes('/geocode')) {
        return `maps:geocode:${address}`;
      } else if (req.path.includes('/reverse-geocode')) {
        return `maps:reverse:${latitude}:${longitude}`;
      }
      
      return generateDefaultKey(req);
    }
  );
};

/**
 * Gallery cache middleware
 * @param {number} ttl - Time to live in seconds (default: 180)
 * @returns {Function} Express middleware
 */
const cacheGallery = (ttl = 180) => {
  return cacheMiddleware(
    ttl,
    (req) => {
      const { page = 1, limit = 20, journeyId } = req.query;
      const userId = req.user.id;
      const pathJourneyId = req.params.journeyId;
      
      if (pathJourneyId) {
        return `gallery:journey:${pathJourneyId}:${page}:${limit}`;
      } else {
        return `gallery:user:${userId}:${page}:${limit}:${journeyId || 'all'}`;
      }
    }
  );
};

/**
 * Health check cache middleware
 * @param {number} ttl - Time to live in seconds (default: 60)
 * @returns {Function} Express middleware
 */
const cacheHealth = (ttl = 60) => {
  return cacheMiddleware(
    ttl,
    (req) => `health:${req.path}`,
    (req, res, data) => {
      // Only cache successful health checks
      return res.statusCode === 200 && data.status === 'OK';
    }
  );
};

/**
 * Cache statistics endpoint
 */
const getCacheStats = (req, res) => {
  const stats = cacheService.getStats();
  
  res.json({
    success: true,
    cache: stats,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Clear cache endpoint (admin only)
 */
const clearCache = (req, res) => {
  const { pattern } = req.query;
  
  if (pattern) {
    const deletedCount = cacheService.deletePattern(pattern);
    res.json({
      success: true,
      message: `Cleared ${deletedCount} cache entries matching pattern: ${pattern}`,
      deletedCount,
    });
  } else {
    cacheService.clear();
    res.json({
      success: true,
      message: 'All cache cleared',
    });
  }
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  cacheLeaderboard,
  cacheUserProfile,
  cacheMaps,
  cacheGallery,
  cacheHealth,
  getCacheStats,
  clearCache,
};