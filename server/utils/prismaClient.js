// server/utils/prismaClient.js
// Resilient Prisma client with connection pooling and retry logic

const { PrismaClient } = require('@prisma/client');

let prisma;

// Connection retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Create Prisma client with connection pooling
function createPrismaClient() {
  const client = new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  // Log warnings
  client.$on('warn', (e) => {
    console.warn('[Prisma] Warning:', e);
  });

  // Log errors
  client.$on('error', (e) => {
    console.error('[Prisma] Error:', e);
  });

  return client;
}

// Get or create Prisma client singleton
function getPrismaClient() {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

// Wrapper for Prisma operations with retry logic
async function withRetry(operation, retries = MAX_RETRIES) {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if it's a connection error
      const isConnectionError = 
        error.code === 'P1001' || // Can't reach database server
        error.code === 'P1002' || // Connection timeout
        error.code === 'P1008' || // Operations timeout
        error.message?.includes('Connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('forcibly closed');
      
      if (!isConnectionError || attempt === retries) {
        // Not a connection error or final attempt - throw immediately
        throw error;
      }
      
      // Log retry attempt
      console.warn(`[Prisma] Database connection failed (attempt ${attempt}/${retries}), retrying in ${RETRY_DELAY}ms...`, {
        error: error.message,
        code: error.code,
      });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      
      // Try to reconnect
      try {
        await prisma.$connect();
      } catch (connectError) {
        console.error('[Prisma] Reconnection attempt failed:', connectError.message);
      }
    }
  }
  
  throw lastError;
}

// Graceful shutdown
async function disconnect() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    console.info('[Prisma] Client disconnected');
  }
}// Handle process termination
process.on('beforeExit', async () => {
  await disconnect();
});

process.on('SIGINT', async () => {
  await disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnect();
  process.exit(0);
});

module.exports = {
  getPrismaClient,
  withRetry,
  disconnect,
};
