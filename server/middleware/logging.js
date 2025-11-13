// server/middleware/logging.js

const logger = require('../services/Logger');
const { sanitizeLogData } = require('../utils/logSanitizer');

/**
 * API request logging middleware
 */
const apiLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Store original end method
  const originalEnd = res.end;
  
  // Override end method to log when response is sent
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    // Log the API request
    logger.api(req, res, responseTime);
    
    // Call original end method
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Authentication event logging middleware
 */
const authLogger = (event) => {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to log auth events
    res.json = function(data) {
      if (res.statusCode < 400 && data.success !== false) {
        logger.auth(event, {
          userId: req.user?.id,
          email: req.user?.email || req.body?.email,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * User action logging middleware
 */
const userActionLogger = (action) => {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to log user actions
    res.json = function(data) {
      if (res.statusCode < 400 && data.success !== false && req.user) {
        logger.userAction(action, req.user.id, {
          resourceId: req.params.id || req.params.journeyId || req.params.groupId,
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          data: sanitizeLogData(req.body),
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Security event logging middleware
 */
const securityLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /script/i,
    /union.*select/i,
    /drop.*table/i,
    /<script/i,
    /javascript:/i,
  ];
  
  const checkSuspicious = (obj) => {
    if (typeof obj === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(obj));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(value => checkSuspicious(value));
    }
    
    return false;
  };
  
  // Check request for suspicious content
  if (checkSuspicious(req.body) || checkSuspicious(req.query) || checkSuspicious(req.params)) {
    logger.security('Suspicious request detected', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
      body: sanitizeLogData(req.body),
      query: req.query,
      params: req.params,
    });
  }
  
  // Check for repeated failed requests
  const failedAttempts = req.rateLimit?.remaining !== undefined && req.rateLimit.remaining < 5;
  if (failedAttempts) {
    logger.security('Multiple failed requests detected', {
      ip: req.ip,
      remaining: req.rateLimit.remaining,
      total: req.rateLimit.total,
      resetTime: req.rateLimit.resetTime,
    });
  }
  
  next();
};

/**
 * Database query logging wrapper
 */
const dbLogger = {
  /**
   * Wrap Prisma client to log queries
   * @param {object} prisma - Prisma client instance
   * @returns {object} Wrapped Prisma client
   */
  wrapPrisma: (prisma) => {
    // Override query methods to add logging
    const originalQuery = prisma.$queryRaw;
    const originalExecuteRaw = prisma.$executeRaw;
    
    prisma.$queryRaw = function(...args) {
      const startTime = Date.now();
      const query = args[0];
      
      return originalQuery.apply(this, args)
        .then(result => {
          const duration = Date.now() - startTime;
          logger.database(query.toString(), duration, { type: 'query', result: 'success' });
          return result;
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          logger.database(query.toString(), duration, { 
            type: 'query', 
            result: 'error', 
            error: error.message 
          });
          throw error;
        });
    };
    
    prisma.$executeRaw = function(...args) {
      const startTime = Date.now();
      const query = args[0];
      
      return originalExecuteRaw.apply(this, args)
        .then(result => {
          const duration = Date.now() - startTime;
          logger.database(query.toString(), duration, { type: 'execute', result: 'success' });
          return result;
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          logger.database(query.toString(), duration, { 
            type: 'execute', 
            result: 'error', 
            error: error.message 
          });
          throw error;
        });
    };
    
    return prisma;
  },
};

/**
 * Error logging middleware
 */
const errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id,
    userAgent: req.headers['user-agent'],
    body: sanitizeLogData(req.body),
    query: req.query,
    params: req.params,
  });
  
  next(err);
};

/**
 * Performance monitoring middleware
 */
const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  const startUsage = process.cpuUsage();
  
  // Store original end method
  const originalEnd = res.end;
  
  // Override end method to log performance metrics
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    const cpuUsage = process.cpuUsage(startUsage);
    
    // Log slow requests
    if (responseTime > 1000) {
      logger.performance('Slow request detected', {
        method: req.method,
        url: req.originalUrl,
        responseTime,
        cpuUsage,
        memoryUsage: process.memoryUsage(),
        userId: req.user?.id,
      });
    }
    
    // Call original end method
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Log system metrics periodically
 */
const startMetricsLogging = () => {
  setInterval(() => {
    const metrics = logger.getMetrics();
    
    logger.info('System metrics', {
      category: 'system_metrics',
      ...metrics,
    });
    
    // Reset metrics after logging
    if (metrics.requests > 1000) { // Reset after every 1000 requests
      logger.resetMetrics();
    }
  }, 5 * 60 * 1000); // Every 5 minutes
};

/**
 * Health check logging
 */
const healthLogger = (componentName, status, details = {}) => {
  const level = status === 'healthy' ? 'info' : 'error';
  
  logger[level](`Health check: ${componentName}`, {
    category: 'health_check',
    component: componentName,
    status,
    ...details,
  });
};

module.exports = {
  apiLogger,
  authLogger,
  userActionLogger,
  securityLogger,
  dbLogger,
  errorLogger,
  performanceMonitor,
  sanitizeLogData,
  startMetricsLogging,
  healthLogger,
};