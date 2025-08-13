// server/services/CacheService.js

class CacheService {
    constructor() {
      this.cache = new Map();
      this.timers = new Map();
      this.stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
      };
      
      // Cleanup interval - remove expired items every 5 minutes
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  
    /**
     * Set a value in cache with optional TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in seconds (default: 300)
     */
    set(key, value, ttl = 300) {
      const expiresAt = Date.now() + (ttl * 1000);
      
      // Clear existing timer if any
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }
      
      // Set value
      this.cache.set(key, {
        value,
        expiresAt,
        createdAt: Date.now(),
      });
      
      // Set expiration timer
      const timer = setTimeout(() => {
        this.delete(key);
      }, ttl * 1000);
      
      this.timers.set(key, timer);
      this.stats.sets++;
      
      return true;
    }
  
    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null if not found/expired
     */
    get(key) {
      const item = this.cache.get(key);
      
      if (!item) {
        this.stats.misses++;
        return null;
      }
      
      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.delete(key);
        this.stats.misses++;
        return null;
      }
      
      this.stats.hits++;
      return item.value;
    }
  
    /**
     * Delete a value from cache
     * @param {string} key - Cache key
     * @returns {boolean} True if deleted, false if not found
     */
    delete(key) {
      const deleted = this.cache.delete(key);
      
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
      
      if (deleted) {
        this.stats.deletes++;
      }
      
      return deleted;
    }
  
    /**
     * Check if key exists in cache
     * @param {string} key - Cache key
     * @returns {boolean} True if exists and not expired
     */
    has(key) {
      const item = this.cache.get(key);
      
      if (!item) {
        return false;
      }
      
      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.delete(key);
        return false;
      }
      
      return true;
    }
  
    /**
     * Clear all cache entries
     */
    clear() {
      // Clear all timers
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      
      this.cache.clear();
      this.timers.clear();
      this.stats.deletes += this.cache.size;
    }
  
    /**
     * Get cache statistics
     * @returns {object} Cache statistics
     */
    getStats() {
      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;
      
      return {
        ...this.stats,
        totalRequests,
        hitRate: `${hitRate}%`,
        cacheSize: this.cache.size,
        memoryUsage: this.getMemoryUsage(),
      };
    }
  
    /**
     * Cleanup expired entries
     */
    cleanup() {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [key, item] of this.cache.entries()) {
        if (now > item.expiresAt) {
          this.delete(key);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`Cache cleanup: removed ${cleanedCount} expired entries`);
      }
    }
  
    /**
     * Get estimated memory usage
     * @returns {string} Memory usage estimate
     */
    getMemoryUsage() {
      let size = 0;
      
      for (const [key, item] of this.cache.entries()) {
        size += key.length * 2; // Rough estimate for string
        size += JSON.stringify(item.value).length * 2; // Rough estimate for value
        size += 32; // Overhead for object structure
      }
      
      if (size < 1024) return `${size}B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
      return `${(size / (1024 * 1024)).toFixed(1)}MB`;
    }
  
    /**
     * Get or set pattern - if key exists, return it, otherwise execute function and cache result
     * @param {string} key - Cache key
     * @param {Function} fn - Function to execute if cache miss
     * @param {number} ttl - Time to live in seconds
     * @returns {any} Cached or computed value
     */
    async getOrSet(key, fn, ttl = 300) {
      const cached = this.get(key);
      
      if (cached !== null) {
        return cached;
      }
      
      try {
        const value = await fn();
        this.set(key, value, ttl);
        return value;
      } catch (error) {
        console.error(`Cache getOrSet error for key ${key}:`, error);
        throw error;
      }
    }
  
    /**
     * Increment a numeric value in cache
     * @param {string} key - Cache key
     * @param {number} increment - Amount to increment (default: 1)
     * @param {number} ttl - Time to live in seconds (default: 300)
     * @returns {number} New value
     */
    increment(key, increment = 1, ttl = 300) {
      const current = this.get(key) || 0;
      const newValue = current + increment;
      this.set(key, newValue, ttl);
      return newValue;
    }
  
    /**
     * Set multiple values at once
     * @param {object} keyValuePairs - Object with key-value pairs
     * @param {number} ttl - Time to live in seconds
     */
    mset(keyValuePairs, ttl = 300) {
      for (const [key, value] of Object.entries(keyValuePairs)) {
        this.set(key, value, ttl);
      }
    }
  
    /**
     * Get multiple values at once
     * @param {string[]} keys - Array of cache keys
     * @returns {object} Object with key-value pairs
     */
    mget(keys) {
      const result = {};
      
      for (const key of keys) {
        result[key] = this.get(key);
      }
      
      return result;
    }
  
    /**
     * Delete keys matching a pattern
     * @param {string} pattern - Pattern to match (simple wildcard support)
     * @returns {number} Number of deleted keys
     */
    deletePattern(pattern) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      let deletedCount = 0;
      
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.delete(key);
          deletedCount++;
        }
      }
      
      return deletedCount;
    }
  
    /**
     * Get all keys in cache
     * @returns {string[]} Array of cache keys
     */
    keys() {
      return Array.from(this.cache.keys());
    }
  
    /**
     * Get keys matching a pattern
     * @param {string} pattern - Pattern to match
     * @returns {string[]} Array of matching keys
     */
    keysPattern(pattern) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return this.keys().filter(key => regex.test(key));
    }
  }
  
  // Create singleton instance
  const cacheService = new CacheService();
  
  // Cache key generators for common patterns
  const CacheKeys = {
    // Leaderboard cache keys
    globalLeaderboard: (sortBy, timeFrame, page, limit) => 
      `leaderboard:global:${sortBy}:${timeFrame}:${page}:${limit}`,
    
    groupLeaderboard: (groupId, sortBy, timeFrame) => 
      `leaderboard:group:${groupId}:${sortBy}:${timeFrame}`,
    
    friendsLeaderboard: (userId, sortBy, timeFrame) => 
      `leaderboard:friends:${userId}:${sortBy}:${timeFrame}`,
    
    userPosition: (userId, sortBy) => 
      `user:position:${userId}:${sortBy}`,
    
    // User data cache keys
    userProfile: (userId) => `user:profile:${userId}`,
    userStats: (userId, timeframe) => `user:stats:${userId}:${timeframe}`,
    userAchievements: (userId) => `user:achievements:${userId}`,
    
    // Journey cache keys
    activeJourney: (userId) => `journey:active:${userId}`,
    journeyHistory: (userId, page, limit, filters) => 
      `journey:history:${userId}:${page}:${limit}:${JSON.stringify(filters)}`,
    
    // Group cache keys
    groupDetails: (groupId) => `group:details:${groupId}`,
    userGroups: (userId, page, limit) => `group:user:${userId}:${page}:${limit}`,
    groupMembers: (groupId) => `group:members:${groupId}`,
    
    // Maps cache keys
    nearbyPlaces: (lat, lng, type, radius) => 
      `maps:nearby:${lat}:${lng}:${type}:${radius}`,
    
    placeDetails: (placeId) => `maps:place:${placeId}`,
    
    geocode: (address) => `maps:geocode:${address}`,
    
    reverseGeocode: (lat, lng) => `maps:reverse:${lat}:${lng}`,
    
    // Gallery cache keys
    userPhotos: (userId, page, limit, journeyId) => 
      `gallery:user:${userId}:${page}:${limit}:${journeyId || 'all'}`,
    
    journeyPhotos: (journeyId, page, limit) => 
      `gallery:journey:${journeyId}:${page}:${limit}`,
    
    // System cache keys
    apiHealth: () => 'system:health',
    dbHealth: () => 'system:db:health',
  };
  
  module.exports = { cacheService, CacheKeys };