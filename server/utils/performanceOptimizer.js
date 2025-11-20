// Performance Optimization Utilities
// server/utils/performanceOptimizer.js

const logger = require('../services/Logger');

class PerformanceOptimizer {
  constructor() {
    this.queryCache = new Map();
    this.slowQueryThreshold = 1000; // 1 second
    this.maxCacheSize = 1000;
  }

  /**
   * Optimize database queries with caching and batching
   */
  async optimizeQuery(queryFn, cacheKey, ttl = 60000) {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (cacheKey && this.queryCache.has(cacheKey)) {
        const cached = this.queryCache.get(cacheKey);
        if (Date.now() - cached.timestamp < ttl) {
          return cached.data;
        }
        this.queryCache.delete(cacheKey);
      }

      // Execute query
      const result = await queryFn();
      
      // Cache result
      if (cacheKey) {
        if (this.queryCache.size >= this.maxCacheSize) {
          // Remove oldest entry
          const firstKey = this.queryCache.keys().next().value;
          this.queryCache.delete(firstKey);
        }
        this.queryCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        logger.warn('Slow query detected', {
          cacheKey,
          duration,
          threshold: this.slowQueryThreshold
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Query optimization failed', {
        cacheKey,
        duration,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Batch multiple queries for efficiency
   */
  async batchQueries(queries) {
    const startTime = Date.now();
    
    try {
      const results = await Promise.allSettled(
        queries.map(({ queryFn, cacheKey, ttl }) => 
          this.optimizeQuery(queryFn, cacheKey, ttl)
        )
      );

      const duration = Date.now() - startTime;
      
      // Log batch performance
      if (duration > this.slowQueryThreshold * queries.length) {
        logger.warn('Slow batch query detected', {
          queryCount: queries.length,
          duration,
          averagePerQuery: duration / queries.length
        });
      }

      return results.map((result, index) => ({
        success: result.status === 'fulfilled',
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      }));
    } catch (error) {
      logger.error('Batch query failed', {
        error: error.message,
        queryCount: queries.length
      });
      throw error;
    }
  }

  /**
   * Optimize group journey queries
   */
  async optimizeGroupJourneyQueries(groupJourneyId, userId) {
    const queries = [
      {
        queryFn: () => this.getGroupJourneyWithInstances(groupJourneyId),
        cacheKey: `group-journey-${groupJourneyId}-full`,
        ttl: 30000 // 30 seconds
      },
      {
        queryFn: () => this.getUserInstance(groupJourneyId, userId),
        cacheKey: `user-${userId}-instance-${groupJourneyId}`,
        ttl: 15000 // 15 seconds
      },
      {
        queryFn: () => this.getGroupMembers(groupJourneyId),
        cacheKey: `group-journey-${groupJourneyId}-members`,
        ttl: 60000 // 1 minute
      }
    ];

    return this.batchQueries(queries);
  }

  /**
   * Clear cache for specific keys
   */
  clearCache(keys) {
    if (Array.isArray(keys)) {
      keys.forEach(key => this.queryCache.delete(key));
    } else {
      this.queryCache.delete(keys);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.queryCache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.calculateHitRate(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Calculate cache hit rate
   */
  calculateHitRate() {
    // This would need to track hits/misses over time
    // For now, return basic stats
    return {
      hits: 0, // Would need to be tracked
      misses: 0, // Would need to be tracked
      ratio: 0
    };
  }

  // Mock database methods - replace with actual implementations
  async getGroupJourneyWithInstances(groupJourneyId) {
    // Implementation would use Prisma
    return null;
  }

  async getUserInstance(groupJourneyId, userId) {
    // Implementation would use Prisma
    return null;
  }

  async getGroupMembers(groupJourneyId) {
    // Implementation would use Prisma
    return null;
  }
}

// Create singleton instance
const performanceOptimizer = new PerformanceOptimizer();

module.exports = performanceOptimizer;