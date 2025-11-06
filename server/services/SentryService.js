// server/services/SentryService.js
// Sentry error tracking and performance monitoring service

const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const logger = require('./Logger');

class SentryService {
  constructor() {
    this.isInitialized = false;
    this.isEnabled = false;
  }

  /**
   * Initialize Sentry with configuration
   */
  init() {
    const dsn = process.env.SENTRY_DSN;
    const environment = process.env.NODE_ENV || 'development';
    const release = process.env.RELEASE_VERSION || `wayfarian-server@${require('../package.json').version}`;

    // Only initialize if DSN is provided
    if (!dsn) {
      logger.warn('Sentry DSN not configured - error tracking disabled', {
        category: 'sentry',
      });
      return;
    }

    try {
      Sentry.init({
        dsn,
        environment,
        release,

        // Performance monitoring
        tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
        
        // Profiling
        profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
        integrations: [
          new ProfilingIntegration(),
        ],

        // Configure which errors to capture
        beforeSend(event, hint) {
          // Don't send errors in development unless explicitly enabled
          if (environment === 'development' && !process.env.SENTRY_ENABLE_IN_DEV) {
            return null;
          }

          // Filter out specific error types
          const error = hint.originalException;
          
          // Don't send auth errors (these are user errors, not system errors)
          if (error && error.message && (
            error.message.includes('Invalid token') ||
            error.message.includes('Token expired') ||
            error.message.includes('Unauthorized')
          )) {
            return null;
          }

          // Don't send validation errors (user input errors)
          if (event.exception?.values?.[0]?.type === 'ValidationError') {
            return null;
          }

          return event;
        },

        // Attach user context
        beforeBreadcrumb(breadcrumb) {
          // Filter sensitive data from breadcrumbs
          if (breadcrumb.category === 'http' && breadcrumb.data) {
            delete breadcrumb.data.Authorization;
            delete breadcrumb.data.password;
          }
          return breadcrumb;
        },
      });

      this.isInitialized = true;
      this.isEnabled = true;

      logger.info('Sentry error tracking initialized', {
        category: 'sentry',
        environment,
        release,
      });
    } catch (error) {
      logger.error('Failed to initialize Sentry', {
        category: 'sentry',
        error: error.message,
      });
    }
  }

  /**
   * Capture an exception
   * @param {Error} error - Error to capture
   * @param {object} context - Additional context
   */
  captureException(error, context = {}) {
    if (!this.isEnabled) {
      return;
    }

    try {
      Sentry.captureException(error, {
        tags: context.tags,
        extra: context.extra,
        user: context.user,
        level: context.level || 'error',
      });
    } catch (err) {
      logger.error('Failed to capture exception in Sentry', {
        category: 'sentry',
        error: err.message,
      });
    }
  }

  /**
   * Capture a message
   * @param {string} message - Message to capture
   * @param {string} level - Severity level
   * @param {object} context - Additional context
   */
  captureMessage(message, level = 'info', context = {}) {
    if (!this.isEnabled) {
      return;
    }

    try {
      Sentry.captureMessage(message, {
        level,
        tags: context.tags,
        extra: context.extra,
        user: context.user,
      });
    } catch (err) {
      logger.error('Failed to capture message in Sentry', {
        category: 'sentry',
        error: err.message,
      });
    }
  }

  /**
   * Set user context
   * @param {object} user - User information
   */
  setUser(user) {
    if (!this.isEnabled) {
      return;
    }

    try {
      Sentry.setUser({
        id: user.id,
        username: user.displayName,
        email: user.email,
      });
    } catch (err) {
      logger.error('Failed to set user context in Sentry', {
        category: 'sentry',
        error: err.message,
      });
    }
  }

  /**
   * Clear user context
   */
  clearUser() {
    if (!this.isEnabled) {
      return;
    }

    try {
      Sentry.setUser(null);
    } catch (err) {
      logger.error('Failed to clear user context in Sentry', {
        category: 'sentry',
        error: err.message,
      });
    }
  }

  /**
   * Add breadcrumb for debugging
   * @param {string} message - Breadcrumb message
   * @param {object} data - Additional data
   * @param {string} category - Breadcrumb category
   */
  addBreadcrumb(message, data = {}, category = 'custom') {
    if (!this.isEnabled) {
      return;
    }

    try {
      Sentry.addBreadcrumb({
        message,
        category,
        data,
        level: 'info',
      });
    } catch (err) {
      logger.error('Failed to add breadcrumb in Sentry', {
        category: 'sentry',
        error: err.message,
      });
    }
  }

  /**
   * Start a transaction for performance monitoring
   * @param {string} name - Transaction name
   * @param {string} op - Operation type
   * @returns {Transaction} Sentry transaction
   */
  startTransaction(name, op = 'http.server') {
    if (!this.isEnabled) {
      return null;
    }

    try {
      return Sentry.startTransaction({
        name,
        op,
      });
    } catch (err) {
      logger.error('Failed to start transaction in Sentry', {
        category: 'sentry',
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Get Sentry request handler middleware
   */
  getRequestHandler() {
    if (!this.isEnabled) {
      return (req, res, next) => next();
    }
    return Sentry.Handlers.requestHandler();
  }

  /**
   * Get Sentry tracing middleware
   */
  getTracingHandler() {
    if (!this.isEnabled) {
      return (req, res, next) => next();
    }
    return Sentry.Handlers.tracingHandler();
  }

  /**
   * Get Sentry error handler middleware
   */
  getErrorHandler() {
    if (!this.isEnabled) {
      return (err, req, res, next) => next(err);
    }
    return Sentry.Handlers.errorHandler();
  }

  /**
   * Flush pending events and close
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>}
   */
  async close(timeout = 2000) {
    if (!this.isEnabled) {
      return true;
    }

    try {
      await Sentry.close(timeout);
      logger.info('Sentry client closed', {
        category: 'sentry',
      });
      return true;
    } catch (err) {
      logger.error('Failed to close Sentry client', {
        category: 'sentry',
        error: err.message,
      });
      return false;
    }
  }
}

// Export singleton instance
const sentryService = new SentryService();
module.exports = sentryService;
