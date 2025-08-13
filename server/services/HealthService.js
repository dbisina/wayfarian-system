// server/services/HealthService.js

const { PrismaClient } = require('@prisma/client');
const { adminStorage, adminAuth } = require('./Firebase');
const mapsService = require('./MapsService');
const { cacheService } = require('./CacheService');
const logger = require('./Logger');
const axios = require('axios');

class HealthService {
  constructor() {
    this.prisma = new PrismaClient();
    this.healthChecks = new Map();
    this.lastHealthCheck = null;
    this.healthHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Run all health checks
   * @returns {Promise<object>} Health check results
   */
  async runAllChecks() {
    const startTime = Date.now();
    const checks = {};
    
    try {
      // Run all health checks in parallel
      const [
        databaseHealth,
        firebaseStorageHealth,
        firebaseAuthHealth,
        mapsHealth,
        cacheHealth,
        systemHealth,
        externalServicesHealth,
      ] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkFirebaseStorage(),
        this.checkFirebaseAuth(),
        this.checkMapsService(),
        this.checkCache(),
        this.checkSystemResources(),
        this.checkExternalServices(),
      ]);

      // Process results
      checks.database = this.processCheckResult(databaseHealth);
      checks.firebaseStorage = this.processCheckResult(firebaseStorageHealth);
      checks.firebaseAuth = this.processCheckResult(firebaseAuthHealth);
      checks.maps = this.processCheckResult(mapsHealth);
      checks.cache = this.processCheckResult(cacheHealth);
      checks.system = this.processCheckResult(systemHealth);
      checks.externalServices = this.processCheckResult(externalServicesHealth);

      // Calculate overall health
      const overallHealth = this.calculateOverallHealth(checks);
      const totalTime = Date.now() - startTime;

      const healthReport = {
        status: overallHealth.status,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        totalCheckTime: totalTime,
        checks,
        summary: overallHealth.summary,
      };

      // Store health check result
      this.lastHealthCheck = healthReport;
      this.addToHistory(healthReport);

      // Log health status
      logger.info(`Health check completed: ${overallHealth.status}`, {
        category: 'health_check',
        status: overallHealth.status,
        checkTime: totalTime,
        failedChecks: overallHealth.summary.failed,
      });

      return healthReport;

    } catch (error) {
      const errorReport = {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
        totalCheckTime: Date.now() - startTime,
      };

      logger.error('Health check failed', {
        category: 'health_check',
        error: error.message,
        stack: error.stack,
      });

      return errorReport;
    }
  }

  /**
   * Check database health
   * @returns {Promise<object>} Database health status
   */
  async checkDatabase() {
    const startTime = Date.now();
    
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Test database operations
      const userCount = await this.prisma.user.count();
      const journeyCount = await this.prisma.journey.count();
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          connection: 'active',
          userCount,
          journeyCount,
          prismaVersion: '5.9.0', // Update based on actual version
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        details: {
          connection: 'failed',
        },
      };
    }
  }

  /**
   * Check Firebase Storage health
   * @returns {Promise<object>} Firebase Storage health status
   */
  async checkFirebaseStorage() {
    const startTime = Date.now();
    
    try {
      if (!process.env.FIREBASE_STORAGE_BUCKET) {
        return {
          status: 'unhealthy',
          responseTime: Date.now() - startTime,
          error: 'Firebase Storage not configured',
        };
      }

      // Test bucket access
      const bucket = adminStorage.bucket();
      await bucket.getMetadata();
      
      // Test file operations (create a test file)
      const testFile = bucket.file('health-checks/test.txt');
      await testFile.save('health-check-test', {
        metadata: {
          contentType: 'text/plain',
        },
      });
      
      // Clean up test file
      await testFile.delete();
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          bucket: process.env.FIREBASE_STORAGE_BUCKET,
          operations: 'read/write successful',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check Firebase Auth health
   * @returns {Promise<object>} Firebase Auth health status
   */
  async checkFirebaseAuth() {
    const startTime = Date.now();
    
    try {
      // Test auth service
      await adminAuth.listUsers(1); // List 1 user to test auth
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          service: 'Firebase Auth',
          operations: 'user management accessible',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check Maps service health
   * @returns {Promise<object>} Maps service health status
   */
  async checkMapsService() {
    const startTime = Date.now();
    
    try {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return {
          status: 'degraded',
          responseTime: Date.now() - startTime,
          warning: 'Google Maps API key not configured',
        };
      }

      // Test a simple geocoding request
      await mapsService.reverseGeocode(37.7749, -122.4194); // San Francisco
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          service: 'Google Maps API',
          operations: 'geocoding successful',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check cache service health
   * @returns {Promise<object>} Cache service health status
   */
  async checkCache() {
    const startTime = Date.now();
    
    try {
      // Test cache operations
      const testKey = 'health-check-test';
      const testValue = { timestamp: Date.now() };
      
      cacheService.set(testKey, testValue, 10);
      const retrieved = cacheService.get(testKey);
      cacheService.delete(testKey);
      
      if (JSON.stringify(retrieved) !== JSON.stringify(testValue)) {
        throw new Error('Cache read/write test failed');
      }
      
      const stats = cacheService.getStats();
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          operations: 'read/write successful',
          cacheSize: stats.cacheSize,
          hitRate: stats.hitRate,
          memoryUsage: stats.memoryUsage,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check system resources
   * @returns {Promise<object>} System health status
   */
  async checkSystemResources() {
    const startTime = Date.now();
    
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();
      
      // Calculate memory usage percentage (assuming 512MB container)
      const maxMemory = 512 * 1024 * 1024; // 512MB in bytes
      const memoryPercent = (memoryUsage.heapUsed / maxMemory) * 100;
      
      // Determine health status based on resource usage
      let status = 'healthy';
      const warnings = [];
      
      if (memoryPercent > 80) {
        status = 'degraded';
        warnings.push('High memory usage');
      }
      
      if (uptime < 60) {
        warnings.push('Recently restarted');
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        status,
        responseTime,
        details: {
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            percentage: Math.round(memoryPercent),
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
          uptime: Math.round(uptime),
          nodeVersion: process.version,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Check external services
   * @returns {Promise<object>} External services health status
   */
  async checkExternalServices() {
    const startTime = Date.now();
    
    try {
      const results = {};
      
      // Check Google Maps API
      if (process.env.GOOGLE_MAPS_API_KEY) {
        try {
          const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
              address: 'San Francisco, CA',
              key: process.env.GOOGLE_MAPS_API_KEY,
            },
            timeout: 5000,
          });
          
          results.googleMaps = {
            status: response.data.status === 'OK' ? 'healthy' : 'unhealthy',
            responseTime: Date.now() - startTime,
          };
        } catch (error) {
          results.googleMaps = {
            status: 'unhealthy',
            error: error.message,
          };
        }
      }
      
      // Check Firebase services connectivity
      try {
        await axios.get('https://firebase.googleapis.com/', { timeout: 5000 });
        results.firebase = {
          status: 'healthy',
          responseTime: Date.now() - startTime,
        };
      } catch (error) {
        results.firebase = {
          status: 'unhealthy',
          error: error.message,
        };
      }
      
      const responseTime = Date.now() - startTime;
      const overallStatus = Object.values(results).every(r => r.status === 'healthy') 
        ? 'healthy' 
        : 'degraded';
      
      return {
        status: overallStatus,
        responseTime,
        details: results,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Process check result from Promise.allSettled
   * @param {object} result - Promise result
   * @returns {object} Processed result
   */
  processCheckResult(result) {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        error: result.reason.message,
        responseTime: 0,
      };
    }
  }

  /**
   * Calculate overall health status
   * @param {object} checks - All check results
   * @returns {object} Overall health status
   */
  calculateOverallHealth(checks) {
    const statuses = Object.values(checks).map(check => check.status);
    const failed = statuses.filter(status => status === 'unhealthy').length;
    const degraded = statuses.filter(status => status === 'degraded').length;
    const healthy = statuses.filter(status => status === 'healthy').length;
    
    let overallStatus = 'healthy';
    
    if (failed > 0) {
      if (failed >= Object.keys(checks).length / 2) {
        overallStatus = 'unhealthy';
      } else {
        overallStatus = 'degraded';
      }
    } else if (degraded > 0) {
      overallStatus = 'degraded';
    }
    
    return {
      status: overallStatus,
      summary: {
        total: statuses.length,
        healthy,
        degraded,
        failed,
      },
    };
  }

  /**
   * Add health check to history
   * @param {object} healthReport - Health check report
   */
  addToHistory(healthReport) {
    this.healthHistory.unshift({
      timestamp: healthReport.timestamp,
      status: healthReport.status,
      checkTime: healthReport.totalCheckTime,
      summary: healthReport.summary,
    });
    
    // Keep only recent history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get health check history
   * @returns {Array} Health check history
   */
  getHistory() {
    return this.healthHistory;
  }

  /**
   * Get last health check result
   * @returns {object|null} Last health check
   */
  getLastHealthCheck() {
    return this.lastHealthCheck;
  }

  /**
   * Check specific component health
   * @param {string} component - Component name
   * @returns {Promise<object>} Component health status
   */
  async checkComponent(component) {
    const methodMap = {
      database: 'checkDatabase',
      firebase_storage: 'checkFirebaseStorage',
      firebase_auth: 'checkFirebaseAuth',
      maps: 'checkMapsService',
      cache: 'checkCache',
      system: 'checkSystemResources',
      external: 'checkExternalServices',
    };
    
    const method = methodMap[component];
    if (!method || typeof this[method] !== 'function') {
      throw new Error(`Unknown component: ${component}`);
    }
    
    return await this[method]();
  }

  /**
   * Start periodic health checks
   * @param {number} interval - Check interval in milliseconds (default: 5 minutes)
   */
  startPeriodicChecks(interval = 5 * 60 * 1000) {
    setInterval(async () => {
      try {
        await this.runAllChecks();
      } catch (error) {
        logger.error('Periodic health check failed', {
          category: 'health_check',
          error: error.message,
        });
      }
    }, interval);
    
    logger.info('Periodic health checks started', {
      category: 'health_check',
      interval: interval / 1000 / 60, // minutes
    });
  }
}

module.exports = new HealthService();