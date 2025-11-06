// server/services/ValkeyJobQueue.js
// Redis/Valkey-backed persistent job queue with retry and scheduling capabilities

const Redis = require('ioredis');
const EventEmitter = require('events');
const logger = require('./Logger');

class ValkeyJobQueue extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.subscriber = null;
    this.workers = new Map();
    this.isProcessing = false;
    this.concurrency = parseInt(process.env.JOB_CONCURRENCY) || 5;
    this.retryAttempts = 3;
    this.retryDelay = 5000; // 5 seconds
    this.activeJobs = new Set();
    
    // Job statistics
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
    };
    
    // Redis key prefixes
    this.keys = {
      queue: 'jobqueue:queue:',
      job: 'jobqueue:job:',
      processing: 'jobqueue:processing',
      failed: 'jobqueue:failed',
      stats: 'jobqueue:stats',
      channel: 'jobqueue:channel',
    };

    this.init();
  }

  /**
   * Initialize Redis/Valkey connection
   */
  async init() {
    try {
      const redisUrl = process.env.REDIS_URL || process.env.VALKEY_URL || 'redis://localhost:6379';
      
      // Create client for commands
      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      // Create separate client for pub/sub
      this.subscriber = new Redis(redisUrl);
      
      this.client.on('connect', () => {
        logger.info('Valkey job queue connected', {
          category: 'job_queue',
          redis: redisUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials
        });
      });

      this.client.on('error', (error) => {
        logger.error('Valkey job queue error', {
          category: 'job_queue',
          error: error.message,
        });
      });

      // Subscribe to job notifications
      await this.subscriber.subscribe(this.keys.channel);
      this.subscriber.on('message', (channel, message) => {
        if (channel === this.keys.channel && message === 'new_job') {
          this.processJobs();
        }
      });

      // Load stats from Redis
      await this.loadStats();
      
      // Start processing
      this.startCleanup();
      this.processJobs();
      
    } catch (error) {
      logger.error('Failed to initialize Valkey job queue', {
        category: 'job_queue',
        error: error.message,
      });
    }
  }

  /**
   * Load statistics from Redis
   */
  async loadStats() {
    try {
      const stats = await this.client.hgetall(this.keys.stats);
      if (stats) {
        this.stats.totalJobs = parseInt(stats.totalJobs) || 0;
        this.stats.completedJobs = parseInt(stats.completedJobs) || 0;
        this.stats.failedJobs = parseInt(stats.failedJobs) || 0;
      }
    } catch (error) {
      logger.error('Failed to load job queue stats', {
        category: 'job_queue',
        error: error.message,
      });
    }
  }

  /**
   * Save statistics to Redis
   */
  async saveStats() {
    try {
      await this.client.hmset(this.keys.stats, {
        totalJobs: this.stats.totalJobs,
        completedJobs: this.stats.completedJobs,
        failedJobs: this.stats.failedJobs,
        activeJobs: this.stats.activeJobs,
      });
    } catch (error) {
      logger.error('Failed to save job queue stats', {
        category: 'job_queue',
        error: error.message,
      });
    }
  }

  /**
   * Add a job to the queue
   * @param {string} type - Job type
   * @param {object} data - Job data
   * @param {object} options - Job options
   * @returns {Promise<string>} Job ID
   */
  async add(type, data = {}, options = {}) {
    const jobId = this.generateJobId();
    const job = {
      id: jobId,
      type,
      data,
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || this.retryAttempts,
      createdAt: Date.now(),
      scheduledAt: Date.now() + (options.delay || 0),
      status: 'waiting',
      queue: options.queue || 'default',
      ...options,
    };

    try {
      // Store job data
      await this.client.set(
        `${this.keys.job}${jobId}`,
        JSON.stringify(job),
        'EX',
        86400 // Expire after 24 hours
      );

      // Add to queue (sorted by priority and scheduledAt)
      const score = job.priority * 1000000000 + job.scheduledAt;
      await this.client.zadd(`${this.keys.queue}${job.queue}`, score, jobId);

      this.stats.totalJobs++;
      await this.saveStats();

      logger.debug(`Job added to queue: ${type}`, {
        category: 'job_queue',
        jobId,
        type,
        queue: job.queue,
      });

      // Notify processors
      await this.client.publish(this.keys.channel, 'new_job');

      return jobId;
    } catch (error) {
      logger.error('Failed to add job to queue', {
        category: 'job_queue',
        error: error.message,
        jobId,
        type,
      });
      throw error;
    }
  }

  /**
   * Register a job worker
   * @param {string} type - Job type
   * @param {Function} handler - Job handler function
   */
  process(type, handler) {
    this.workers.set(type, handler);
    logger.info(`Worker registered for job type: ${type}`, {
      category: 'job_queue',
      type,
    });
  }

  /**
   * Process jobs in the queue
   */
  async processJobs() {
    if (this.isProcessing || !this.client) return;
    
    this.isProcessing = true;
    
    try {
      while (this.activeJobs.size < this.concurrency) {
        const job = await this.getNextJob();
        
        if (!job) {
          break; // No jobs available
        }
        
        // Process job in background
        setImmediate(() => this.executeJob(job));
      }
    } catch (error) {
      logger.error('Error processing jobs', {
        category: 'job_queue',
        error: error.message,
      });
    } finally {
      this.isProcessing = false;
      
      // Schedule next processing cycle if there are jobs waiting
      if (await this.hasWaitingJobs()) {
        setTimeout(() => this.processJobs(), 1000);
      }
    }
  }

  /**
   * Get next job to process
   * @returns {Promise<object|null>} Next job or null
   */
  async getNextJob() {
    try {
      // Get all queue names
      const queues = ['default', 'high', 'low']; // Add more queues as needed
      const now = Date.now();

      for (const queue of queues) {
        const queueKey = `${this.keys.queue}${queue}`;
        
        // Get jobs that are ready to run
        const jobIds = await this.client.zrangebyscore(queueKey, 0, now, 'LIMIT', 0, 1);
        
        if (jobIds && jobIds.length > 0) {
          const jobId = jobIds[0];
          
          // Remove from queue atomically
          const removed = await this.client.zrem(queueKey, jobId);
          if (removed === 0) continue; // Already processed by another worker
          
          // Get job data
          const jobData = await this.client.get(`${this.keys.job}${jobId}`);
          if (!jobData) continue; // Job expired
          
          const job = JSON.parse(jobData);
          
          // Add to processing set
          await this.client.sadd(this.keys.processing, jobId);
          
          return job;
        }
      }

      return null;
    } catch (error) {
      logger.error('Error getting next job', {
        category: 'job_queue',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Execute a job
   * @param {object} job - Job to execute
   */
  async executeJob(job) {
    job.status = 'active';
    job.startedAt = Date.now();
    job.attempts++;
    
    this.activeJobs.add(job.id);
    this.stats.activeJobs = this.activeJobs.size;

    this.emit('job:start', job);

    try {
      const worker = this.workers.get(job.type);
      
      if (!worker) {
        throw new Error(`No worker found for job type: ${job.type}`);
      }

      // Update job status
      await this.client.set(
        `${this.keys.job}${job.id}`,
        JSON.stringify(job),
        'EX',
        86400
      );

      // Execute job with timeout
      const result = await this.executeWithTimeout(worker, job, job.timeout || 30000);
      
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;

      // Remove from processing
      await this.client.srem(this.keys.processing, job.id);

      // Update stats
      this.stats.completedJobs++;
      await this.saveStats();

      this.emit('job:complete', job, result);
      
      logger.info(`Job completed: ${job.type}`, {
        category: 'job_queue',
        jobId: job.id,
        type: job.type,
        duration: Date.now() - job.startedAt,
      });

    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = Date.now();

      this.emit('job:failed', job, error);

      logger.error(`Job failed: ${job.type}`, {
        category: 'job_queue',
        jobId: job.id,
        type: job.type,
        error: error.message,
        attempts: job.attempts,
      });

      // Retry job if attempts remaining
      if (job.attempts < job.maxAttempts) {
        job.status = 'waiting';
        job.scheduledAt = Date.now() + this.retryDelay;
        
        // Re-add to queue
        const score = job.priority * 1000000000 + job.scheduledAt;
        await this.client.zadd(`${this.keys.queue}${job.queue}`, score, job.id);
        await this.client.set(`${this.keys.job}${job.id}`, JSON.stringify(job), 'EX', 86400);
        await this.client.srem(this.keys.processing, job.id);
        
        logger.info(`Job retry scheduled: ${job.type}`, {
          category: 'job_queue',
          jobId: job.id,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
        });
      } else {
        // Move to failed set
        await this.client.sadd(this.keys.failed, job.id);
        await this.client.srem(this.keys.processing, job.id);
        
        this.stats.failedJobs++;
        await this.saveStats();
      }
    } finally {
      this.activeJobs.delete(job.id);
      this.stats.activeJobs = this.activeJobs.size;
      
      // Continue processing
      setImmediate(() => this.processJobs());
    }
  }

  /**
   * Execute job with timeout
   * @param {Function} worker - Worker function
   * @param {object} job - Job object
   * @param {number} timeout - Timeout in ms
   * @returns {Promise} Job result
   */
  executeWithTimeout(worker, job, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job timeout after ${timeout}ms`));
      }, timeout);

      Promise.resolve(worker(job))
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if there are waiting jobs
   * @returns {Promise<boolean>} Has waiting jobs
   */
  async hasWaitingJobs() {
    try {
      const queues = ['default', 'high', 'low'];
      const now = Date.now();

      for (const queue of queues) {
        const count = await this.client.zcount(`${this.keys.queue}${queue}`, 0, now);
        if (count > 0) return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate unique job ID
   * @returns {string} Job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<object|null>} Job object
   */
  async getJob(jobId) {
    try {
      const jobData = await this.client.get(`${this.keys.job}${jobId}`);
      return jobData ? JSON.parse(jobData) : null;
    } catch (error) {
      logger.error('Error getting job', {
        category: 'job_queue',
        error: error.message,
        jobId,
      });
      return null;
    }
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID
   * @returns {Promise<boolean>} Success
   */
  async cancelJob(jobId) {
    try {
      const job = await this.getJob(jobId);
      
      if (!job) {
        return false;
      }

      if (job.status === 'active') {
        // Cannot cancel active job
        return false;
      }

      job.status = 'cancelled';
      job.cancelledAt = Date.now();

      // Remove from queue
      const queues = ['default', 'high', 'low'];
      for (const queue of queues) {
        await this.client.zrem(`${this.keys.queue}${queue}`, jobId);
      }

      // Update job data
      await this.client.set(`${this.keys.job}${jobId}`, JSON.stringify(job), 'EX', 3600);

      logger.info(`Job cancelled: ${job.type}`, {
        category: 'job_queue',
        jobId,
        type: job.type,
      });

      return true;
    } catch (error) {
      logger.error('Error cancelling job', {
        category: 'job_queue',
        error: error.message,
        jobId,
      });
      return false;
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<object>} Queue statistics
   */
  async getStats() {
    try {
      const queues = ['default', 'high', 'low'];
      const queueSizes = {};

      for (const queue of queues) {
        queueSizes[queue] = await this.client.zcard(`${this.keys.queue}${queue}`);
      }

      const totalQueued = Object.values(queueSizes).reduce((sum, count) => sum + count, 0);
      const processingCount = await this.client.scard(this.keys.processing);
      const failedCount = await this.client.scard(this.keys.failed);

      return {
        ...this.stats,
        queueSizes,
        totalQueued,
        processingCount,
        failedCount,
        registeredWorkers: this.workers.size,
      };
    } catch (error) {
      logger.error('Error getting job queue stats', {
        category: 'job_queue',
        error: error.message,
      });
      return this.stats;
    }
  }

  /**
   * Clear completed and failed jobs
   */
  async cleanup() {
    try {
      let cleanedCount = 0;
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      // Get all job IDs (scan through keys)
      const stream = this.client.scanStream({
        match: `${this.keys.job}*`,
        count: 100,
      });

      stream.on('data', async (keys) => {
        for (const key of keys) {
          try {
            const jobData = await this.client.get(key);
            if (!jobData) continue;

            const job = JSON.parse(jobData);

            const shouldClean = (
              (job.status === 'completed' && job.completedAt < oneHourAgo) ||
              (job.status === 'failed' && job.failedAt < oneHourAgo) ||
              (job.status === 'cancelled' && job.cancelledAt < oneHourAgo)
            );

            if (shouldClean) {
              await this.client.del(key);
              cleanedCount++;
            }
          } catch (err) {
            // Skip invalid jobs
          }
        }
      });

      stream.on('end', () => {
        if (cleanedCount > 0) {
          logger.info(`Job cleanup: removed ${cleanedCount} old jobs`, {
            category: 'job_queue',
            cleanedCount,
          });
        }
      });
    } catch (error) {
      logger.error('Error during job cleanup', {
        category: 'job_queue',
        error: error.message,
      });
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Shutdown job queue gracefully
   */
  async shutdown() {
    logger.info('Shutting down Valkey job queue...', {
      category: 'job_queue',
    });

    // Wait for active jobs to complete (max 30 seconds)
    const startTime = Date.now();
    while (this.activeJobs.size > 0 && (Date.now() - startTime) < 30000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.client) {
      await this.client.quit();
    }

    if (this.subscriber) {
      await this.subscriber.quit();
    }

    logger.info('Valkey job queue shutdown complete', {
      category: 'job_queue',
      remainingActiveJobs: this.activeJobs.size,
    });
  }
}

// Export singleton instance
const valkeyJobQueue = new ValkeyJobQueue();
module.exports = valkeyJobQueue;
