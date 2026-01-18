// server/index.js 

// IMPORTANT: Sentry must be initialized before any other imports
const sentryService = require('./services/SentryService');
sentryService.init();

const app = require('./app');
const http = require('http');
const { initializeSocket } = require('./sockets');
const { schedulePeriodicJobs } = require('./jobs/workers');
const { startReminderJob } = require('./jobs/journeyReminderJob');
const healthService = require('./services/HealthService');
const logger = require('./services/Logger');
const { startMetricsLogging } = require('./middleware/logging');

const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = initializeSocket(server);

// Make io accessible to routes via app
app.set('io', io);

// Start background services
schedulePeriodicJobs();
startMetricsLogging();
startReminderJob(); // Start journey reminder notifications
healthService.startPeriodicChecks(5 * 60 * 1000); // Every 5 minutes

// Pre-warm database connection to avoid cold-start delays
const warmupDatabase = async () => {
  try {
    const prisma = require('./prisma/client');
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    logger.info(`🔥 Database connection pre-warmed in ${Date.now() - startTime}ms`);
  } catch (error) {
    logger.warn('Database pre-warm failed (will retry on first request)', { error: error.message });
  }
};

// Start server - bind to 0.0.0.0 to allow network access
(async () => {
  // Pre-warm database before accepting requests
  await warmupDatabase();
  
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Wayfarian API Server running on port ${PORT}`);
    logger.info(`🌐 Server accessible at http://0.0.0.0:${PORT}`);
    logger.info(`🔌 Socket.io server ready for real-time connections`);
    logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔧 Background jobs and health checks initialized`);
  });
})();

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    // Close server
    server.close(() => {
      logger.info('HTTP server closed');
    });
    
    // Close Socket.io
    io.close(() => {
      logger.info('Socket.io server closed');
    });
    
    // Shutdown job queue
    const { jobQueue } = require('./services/JobQueue');
    await jobQueue.shutdown();
    
  // Close database connections (shared client)
  const prisma = require('./prisma/client');
  await prisma.$disconnect();
    logger.info('Database connections closed');
    
    // Close Sentry client
    await sentryService.close();
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    sentryService.captureException(error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  sentryService.captureException(error, {
    tags: { type: 'uncaughtException' },
  });
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  sentryService.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
    tags: { type: 'unhandledRejection' },
  });
  gracefulShutdown();
});

module.exports = { app, server, io };