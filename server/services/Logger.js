// server/services/Logger.js

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
    
    // Ensure logs directory exists
    this.logsDir = path.join(__dirname, '../logs');
    this.ensureLogsDirectory();
    
    // Log file paths
    this.logFiles = {
      error: path.join(this.logsDir, 'error.log'),
      combined: path.join(this.logsDir, 'combined.log'),
      auth: path.join(this.logsDir, 'auth.log'),
      api: path.join(this.logsDir, 'api.log'),
      performance: path.join(this.logsDir, 'performance.log'),
    };
    
    // Performance tracking
    this.performanceMetrics = {
      requests: 0,
      totalResponseTime: 0,
      slowQueries: 0,
      errors: 0,
    };
  }

  /**
   * Ensure logs directory exists
   */
  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Check if log level should be logged
   * @param {string} level - Log level
   * @returns {boolean} Should log
   */
  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  /**
   * Format log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   * @returns {string} Formatted log entry
   */
  formatLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta,
      environment: process.env.NODE_ENV || 'development',
      service: 'wayfarian-api',
    };

    return JSON.stringify(logEntry);
  }

  /**
   * Write log to file
   * @param {string} filename - Log file path
   * @param {string} content - Log content
   */
  writeToFile(filename, content) {
    try {
      fs.appendFileSync(filename, content + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Console log with colors
   * @param {string} level - Log level
   * @param {string} message - Message
   * @param {object} meta - Metadata
   */
  consoleLog(level, message, meta = {}) {
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[90m', // Gray
    };
    
    const reset = '\x1b[0m';
    const timestamp = new Date().toISOString();
    
    const coloredLevel = `${colors[level]}${level.toUpperCase()}${reset}`;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    
    console.log(`[${timestamp}] ${coloredLevel}: ${message}${metaStr}`);
  }

  /**
   * Log error
   * @param {string} message - Error message
   * @param {object} meta - Error metadata
   */
  error(message, meta = {}) {
    if (!this.shouldLog('error')) return;
    
    const logContent = this.formatLog('error', message, {
      ...meta,
      stack: meta.stack || (new Error().stack),
    });
    
    this.consoleLog('error', message, meta);
    this.writeToFile(this.logFiles.error, logContent);
    this.writeToFile(this.logFiles.combined, logContent);
    
    this.performanceMetrics.errors++;
  }

  /**
   * Log warning
   * @param {string} message - Warning message
   * @param {object} meta - Warning metadata
   */
  warn(message, meta = {}) {
    if (!this.shouldLog('warn')) return;
    
    const logContent = this.formatLog('warn', message, meta);
    
    this.consoleLog('warn', message, meta);
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log info
   * @param {string} message - Info message
   * @param {object} meta - Info metadata
   */
  info(message, meta = {}) {
    if (!this.shouldLog('info')) return;
    
    const logContent = this.formatLog('info', message, meta);
    
    this.consoleLog('info', message, meta);
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log debug
   * @param {string} message - Debug message
   * @param {object} meta - Debug metadata
   */
  debug(message, meta = {}) {
    if (!this.shouldLog('debug')) return;
    
    const logContent = this.formatLog('debug', message, meta);
    
    this.consoleLog('debug', message, meta);
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log authentication events
   * @param {string} event - Auth event type
   * @param {object} meta - Auth metadata
   */
  auth(event, meta = {}) {
    const message = `Auth event: ${event}`;
    const logContent = this.formatLog('info', message, {
      ...meta,
      category: 'authentication',
      event,
    });
    
    this.consoleLog('info', message, meta);
    this.writeToFile(this.logFiles.auth, logContent);
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log API requests
   * @param {object} req - Express request
   * @param {object} res - Express response
   * @param {number} responseTime - Response time in ms
   */
  api(req, res, responseTime) {
    const message = `${req.method} ${req.originalUrl}`;
    const meta = {
      category: 'api',
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      userId: req.user?.id,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      query: req.query,
      params: req.params,
    };
    
    // Determine log level based on status code
    let level = 'info';
    if (res.statusCode >= 500) {
      level = 'error';
    } else if (res.statusCode >= 400) {
      level = 'warn';
    }
    
    const logContent = this.formatLog(level, message, meta);
    
    this.consoleLog(level, message, { 
      statusCode: res.statusCode, 
      responseTime: `${responseTime}ms`,
      userId: req.user?.id,
    });
    
    this.writeToFile(this.logFiles.api, logContent);
    this.writeToFile(this.logFiles.combined, logContent);
    
    // Track performance metrics
    this.performanceMetrics.requests++;
    this.performanceMetrics.totalResponseTime += responseTime;
    
    if (responseTime > 1000) { // Slow request threshold
      this.performanceMetrics.slowQueries++;
      this.performance('Slow API request', {
        method: req.method,
        url: req.originalUrl,
        responseTime,
        userId: req.user?.id,
      });
    }
  }

  /**
   * Log performance metrics
   * @param {string} message - Performance message
   * @param {object} meta - Performance metadata
   */
  performance(message, meta = {}) {
    const logContent = this.formatLog('warn', message, {
      ...meta,
      category: 'performance',
    });
    
    this.consoleLog('warn', message, meta);
    this.writeToFile(this.logFiles.performance, logContent);
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log database queries
   * @param {string} query - SQL query
   * @param {number} duration - Query duration in ms
   * @param {object} meta - Query metadata
   */
  database(query, duration, meta = {}) {
    const message = 'Database query executed';
    const logMeta = {
      ...meta,
      category: 'database',
      query: query.length > 500 ? query.substring(0, 500) + '...' : query,
      duration,
    };
    
    let level = 'debug';
    if (duration > 1000) { // Slow query threshold
      level = 'warn';
      this.performanceMetrics.slowQueries++;
    }
    
    const logContent = this.formatLog(level, message, logMeta);
    
    if (level === 'warn') {
      this.consoleLog(level, `Slow database query (${duration}ms)`, { query: query.substring(0, 100) + '...' });
    }
    
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log user actions
   * @param {string} action - User action
   * @param {string} userId - User ID
   * @param {object} meta - Action metadata
   */
  userAction(action, userId, meta = {}) {
    const message = `User action: ${action}`;
    const logContent = this.formatLog('info', message, {
      ...meta,
      category: 'user_action',
      action,
      userId,
    });
    
    this.consoleLog('info', message, { action, userId });
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Log security events
   * @param {string} event - Security event
   * @param {object} meta - Security metadata
   */
  security(event, meta = {}) {
    const message = `Security event: ${event}`;
    const logContent = this.formatLog('warn', message, {
      ...meta,
      category: 'security',
      event,
    });
    
    this.consoleLog('warn', message, meta);
    this.writeToFile(this.logFiles.combined, logContent);
  }

  /**
   * Get performance metrics
   * @returns {object} Performance metrics
   */
  getMetrics() {
    const avgResponseTime = this.performanceMetrics.requests > 0 
      ? this.performanceMetrics.totalResponseTime / this.performanceMetrics.requests 
      : 0;
      
    return {
      ...this.performanceMetrics,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    this.performanceMetrics = {
      requests: 0,
      totalResponseTime: 0,
      slowQueries: 0,
      errors: 0,
    };
  }

  /**
   * Get log files list
   * @returns {Array} List of log files with sizes
   */
  getLogFiles() {
    const files = [];
    
    for (const [name, filepath] of Object.entries(this.logFiles)) {
      try {
        const stats = fs.statSync(filepath);
        files.push({
          name,
          path: filepath,
          size: stats.size,
          modified: stats.mtime,
        });
      } catch (error) {
        files.push({
          name,
          path: filepath,
          size: 0,
          modified: null,
          error: 'File not found',
        });
      }
    }
    
    return files;
  }

  /**
   * Rotate log files (basic implementation)
   */
  rotateLogs() {
    for (const [name, filepath] of Object.entries(this.logFiles)) {
      try {
        const stats = fs.statSync(filepath);
        
        // Rotate if file is larger than 50MB
        if (stats.size > 50 * 1024 * 1024) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedPath = `${filepath}.${timestamp}`;
          
          fs.renameSync(filepath, rotatedPath);
          this.info(`Log file rotated: ${name}`, { original: filepath, rotated: rotatedPath });
        }
      } catch (error) {
        this.error('Failed to rotate log file', { file: name, error: error.message });
      }
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Auto-rotate logs daily
setInterval(() => {
  logger.rotateLogs();
}, 24 * 60 * 60 * 1000); // 24 hours

module.exports = logger;