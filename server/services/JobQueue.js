// server/services/JobQueue.js

const EventEmitter = require('events');
const logger = require('./Logger');

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.workers = new Map();
    this.queues = new Map();
    this.isProcessing = false;
    this.concurrency = parseInt(process.env.JOB_CONCURRENCY) || 5;
    this.retryAttempts = 3;
    this.retryDelay = 5000; // 5 seconds
    
    // Job statistics
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
    };
    
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.on('job:start', (job) => {
      this.stats.activeJobs++;
      logger.info(`Job started: ${job.type}`, {
        category: 'job_queue',
        jobId: job.id,
        type: job.type,
      });
    });

    this.on('job:complete', (job, result) => {
      this.stats.activeJobs--;
      this.stats.completedJobs++;
      logger.info(`Job completed: ${job.type}`, {
        category: 'job_queue',
        jobId: job.id,
        type: job.type,
        duration: Date.now() - job.startedAt,
      });
    });

    this.on('job:failed', (job, error) => {
      this.stats.activeJobs--;
      this.stats.failedJobs++;
      logger.error(`Job failed: ${job.type}`, {
        category: 'job_queue',
        jobId: job.id,
        type: job.type,
        error: error.message,
        attempts: job.attempts,
      });
    });
  }

  /**
   * Add a job to the queue
   * @param {string} type - Job type
   * @param {object} data - Job data
   * @param {object} options - Job options
   * @returns {string} Job ID
   */
  add(type, data = {}, options = {}) {
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
      ...options,
    };

    this.jobs.set(jobId, job);
    
    // Add to appropriate queue
    const queueName = options.queue || 'default';
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    
    this.queues.get(queueName).push(jobId);
    this.stats.totalJobs++;

    logger.debug(`Job added to queue: ${type}`, {
      category: 'job_queue',
      jobId,
      type,
      queue: queueName,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      setImmediate(() => this.processJobs());
    }

    return jobId;
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
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      while (this.stats.activeJobs < this.concurrency) {
        const job = this.getNextJob();
        
        if (!job) {
          break; // No jobs available
        }
        
        // Process job in background
        setImmediate(() => this.executeJob(job));
      }
    } finally {
      this.isProcessing = false;
      
      // Schedule next processing cycle if there are jobs waiting
      if (this.hasWaitingJobs()) {
        setTimeout(() => this.processJobs(), 1000);
      }
    }
  }

  /**
   * Get next job to process
   * @returns {object|null} Next job or null
   */
  getNextJob() {
    let selectedJob = null;
    let selectedQueue = null;
    let selectedIndex = -1;

    // Find highest priority job across all queues
    for (const [queueName, jobIds] of this.queues.entries()) {
      for (let i = 0; i < jobIds.length; i++) {
        const jobId = jobIds[i];
        const job = this.jobs.get(jobId);
        
        if (!job || job.status !== 'waiting') continue;
        
        // Check if job is scheduled to run
        if (job.scheduledAt > Date.now()) continue;
        
        // Select job with highest priority (or first available)
        if (!selectedJob || job.priority > selectedJob.priority) {
          selectedJob = job;
          selectedQueue = queueName;
          selectedIndex = i;
        }
      }
    }

    // Remove job from queue
    if (selectedJob && selectedQueue && selectedIndex >= 0) {
      this.queues.get(selectedQueue).splice(selectedIndex, 1);
    }

    return selectedJob;
  }

  /**
   * Execute a job
   * @param {object} job - Job to execute
   */
  async executeJob(job) {
    job.status = 'active';
    job.startedAt = Date.now();
    job.attempts++;

    this.emit('job:start', job);

    try {
      const worker = this.workers.get(job.type);
      
      if (!worker) {
        throw new Error(`No worker found for job type: ${job.type}`);
      }

      // Execute job with timeout
      const result = await this.executeWithTimeout(worker, job, job.timeout);
      
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;

      this.emit('job:complete', job, result);
      
      // Clean up completed job after a delay
      setTimeout(() => this.jobs.delete(job.id), 60000); // 1 minute

    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = Date.now();

      this.emit('job:failed', job, error);

      // Retry job if attempts remaining
      if (job.attempts < job.maxAttempts) {
        job.status = 'waiting';
        job.scheduledAt = Date.now() + this.retryDelay;
        
        const queueName = job.queue || 'default';
        this.queues.get(queueName).push(job.id);
        
        logger.info(`Job retry scheduled: ${job.type}`, {
          category: 'job_queue',
          jobId: job.id,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
        });
      } else {
        // Clean up failed job
        setTimeout(() => this.jobs.delete(job.id), 300000); // 5 minutes
      }
    }

    // Continue processing
    setImmediate(() => this.processJobs());
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
   * @returns {boolean} Has waiting jobs
   */
  hasWaitingJobs() {
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'waiting' && job.scheduledAt <= Date.now()) {
        return true;
      }
    }
    return false;
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
   * @returns {object|null} Job object
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get jobs by status
   * @param {string} status - Job status
   * @returns {Array} Jobs with specified status
   */
  getJobsByStatus(status) {
    const jobs = [];
    for (const job of this.jobs.values()) {
      if (job.status === status) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID
   * @returns {boolean} Success
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    
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
    for (const [queueName, jobIds] of this.queues.entries()) {
      const index = jobIds.indexOf(jobId);
      if (index >= 0) {
        jobIds.splice(index, 1);
        break;
      }
    }

    logger.info(`Job cancelled: ${job.type}`, {
      category: 'job_queue',
      jobId,
      type: job.type,
    });

    return true;
  }

  /**
   * Get queue statistics
   * @returns {object} Queue statistics
   */
  getStats() {
    const queueSizes = {};
    for (const [queueName, jobIds] of this.queues.entries()) {
      queueSizes[queueName] = jobIds.length;
    }

    return {
      ...this.stats,
      queueSizes,
      totalQueued: Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.length, 0),
      registeredWorkers: this.workers.size,
    };
  }

  /**
   * Clear completed and failed jobs
   */
  cleanup() {
    let cleanedCount = 0;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [jobId, job] of this.jobs.entries()) {
      const shouldClean = (
        (job.status === 'completed' && job.completedAt < oneHourAgo) ||
        (job.status === 'failed' && job.failedAt < oneHourAgo) ||
        (job.status === 'cancelled' && job.cancelledAt < oneHourAgo)
      );

      if (shouldClean) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Job cleanup: removed ${cleanedCount} old jobs`, {
        category: 'job_queue',
        cleanedCount,
      });
    }

    return cleanedCount;
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
    logger.info('Shutting down job queue...', {
      category: 'job_queue',
    });

    // Wait for active jobs to complete (max 30 seconds)
    const startTime = Date.now();
    while (this.stats.activeJobs > 0 && (Date.now() - startTime) < 30000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Job queue shutdown complete', {
      category: 'job_queue',
      remainingActiveJobs: this.stats.activeJobs,
    });
  }
}

module.exports = new JobQueue();