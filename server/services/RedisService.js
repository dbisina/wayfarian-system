// server/services/RedisService.js
// Redis caching service for performance optimization

const Redis = require('ioredis');
const logger = require('./Logger');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    // Default TTL values (in seconds)
    this.TTL = {
      SHORT: 60,           // 1 minute
      MEDIUM: 300,         // 5 minutes
      LONG: 1800,          // 30 minutes
      HOUR: 3600,          // 1 hour
      DAY: 86400,          // 24 hours
      WEEK: 604800,        // 7 days
    };
    
    this.init();
  }

  init() {
    try {
      // Check if Redis/Valkey should be disabled
      if (process.env.DISABLE_REDIS === 'true') {
        logger.info('Redis/Valkey is disabled via DISABLE_REDIS environment variable');
        return;
      }

      // Support both Valkey and Redis URLs (Valkey takes precedence)
      const redisUrl = process.env.VALKEY_URL || process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => {
          if (times > this.maxReconnectAttempts) {
            logger.warn('Redis max reconnection attempts reached - disabling Redis');
            this.isConnected = false;
            return null; // Stop reconnecting
          }
          const delay = Math.min(times * 200, 2000);
          logger.info(`Redis reconnecting in ${delay}ms...`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 5000, // Reduced from 10s to 5s
        lazyConnect: false,
      });

      this.client.on('connect', () => {
        const serviceName = process.env.VALKEY_URL ? 'Valkey' : 'Redis';
        logger.info(`${serviceName} client connected`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('ready', () => {
        const serviceName = process.env.VALKEY_URL ? 'Valkey' : 'Redis';
        logger.info(`${serviceName} client ready`);
      });

      this.client.on('error', (err) => {
        // Only log first error, suppress subsequent errors
        if (this.reconnectAttempts <= 1) {
          logger.error('Redis client error:', err);
        }
        this.isConnected = false;
      });

      this.client.on('close', () => {
        // Only log first close, suppress subsequent closes
        if (this.reconnectAttempts <= 1) {
          logger.warn('Redis connection closed');
        }
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        const serviceName = process.env.VALKEY_URL ? 'Valkey' : 'Redis';
        logger.info(`${serviceName} reconnecting... (attempt ${this.reconnectAttempts})`);
      });

    } catch (error) {
      const serviceName = process.env.VALKEY_URL ? 'Valkey' : 'Redis';
      logger.warn(`${serviceName} initialization failed - continuing without cache:`, error.message);
      this.isConnected = false;
      this.client = null;
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.isConnected) return null;
    
    try {
      const value = await this.client.get(key);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return null;
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = this.TTL.MEDIUM) {
    if (!this.isConnected) return false;
    
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern) {
    if (!this.isConnected) return 0;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      
      const pipeline = this.client.pipeline();
      keys.forEach(key => pipeline.del(key));
      await pipeline.exec();
      
      return keys.length;
    } catch (error) {
      logger.error(`Redis DEL pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isConnected) return false;
    
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration on existing key
   */
  async expire(key, ttl) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment counter
   */
  async incr(key, amount = 1) {
    if (!this.isConnected) return null;
    
    try {
      if (amount === 1) {
        return await this.client.incr(key);
      }
      return await this.client.incrby(key, amount);
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget(keys) {
    if (!this.isConnected || !keys.length) return [];
    
    try {
      const values = await this.client.mget(...keys);
      return values.map(v => {
        if (!v) return null;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      });
    } catch (error) {
      logger.error('Redis MGET error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(keyValuePairs, ttl = this.TTL.MEDIUM) {
    if (!this.isConnected || !keyValuePairs.length) return false;
    
    try {
      const pipeline = this.client.pipeline();
      
      for (const [key, value] of keyValuePairs) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Redis MSET error:', error);
      return false;
    }
  }

  /**
   * Add to sorted set
   */
  async zadd(key, score, member, ttl = null) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.zadd(key, score, member);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return true;
    } catch (error) {
      logger.error(`Redis ZADD error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get range from sorted set
   */
  async zrange(key, start, stop, withScores = false) {
    if (!this.isConnected) return [];
    
    try {
      if (withScores) {
        return await this.client.zrange(key, start, stop, 'WITHSCORES');
      }
      return await this.client.zrange(key, start, stop);
    } catch (error) {
      logger.error(`Redis ZRANGE error for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Get reverse range from sorted set (highest to lowest)
   */
  async zrevrange(key, start, stop, withScores = false) {
    if (!this.isConnected) return [];
    
    try {
      if (withScores) {
        return await this.client.zrevrange(key, start, stop, 'WITHSCORES');
      }
      return await this.client.zrevrange(key, start, stop);
    } catch (error) {
      logger.error(`Redis ZREVRANGE error for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Cache wrapper - get from cache or execute function and cache result
   */
  async cacheWrap(key, fetchFn, ttl = this.TTL.MEDIUM) {
    try {
      // Try to get from cache
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Execute fetch function
      const result = await fetchFn();
      
      // Cache result
      if (result !== null && result !== undefined) {
        await this.set(key, result, ttl);
      }
      
      return result;
    } catch (error) {
      logger.error(`Cache wrap error for key ${key}:`, error);
      // If caching fails, still return the result
      return await fetchFn();
    }
  }

  /**
   * Clear entire cache (use with caution!)
   */
  async flushAll() {
    if (!this.isConnected) return false;
    
    try {
      await this.client.flushall();
      logger.warn('Redis: All keys flushed');
      return true;
    } catch (error) {
      logger.error('Redis FLUSHALL error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return {
        connected: false,
        message: 'Redis not connected'
      };
    }
    
    try {
      const info = await this.client.info('stats');
      const dbSize = await this.client.dbsize();
      
      return {
        connected: true,
        dbSize,
        info: info,
      };
    } catch (error) {
      logger.error('Redis STATS error:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis client disconnected');
    }
  }

  /**
   * Generate cache key
   */
  key(...parts) {
    return parts.filter(p => p !== null && p !== undefined).join(':');
  }
}

// Singleton instance
const redisService = new RedisService();

module.exports = redisService;
