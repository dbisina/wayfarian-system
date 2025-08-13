// server/index.js 

const app = require('./app');
const http = require('http');
const { initializeSocket } = require('./sockets');
const { schedulePeriodicJobs } = require('./jobs/workers');
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
healthService.startPeriodicChecks(5 * 60 * 1000); // Every 5 minutes

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Wayfarian API Server running on port ${PORT}`);
  logger.info(`🔌 Socket.io server ready for real-time connections`);
  logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔧 Background jobs and health checks initialized`);
});

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
    
    // Close database connections
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$disconnect();
    logger.info('Database connections closed');
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  gracefulShutdown();
});

module.exports = { app, server, io };