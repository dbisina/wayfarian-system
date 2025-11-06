// server/prisma/client.js

const { PrismaClient } = require('@prisma/client');
const { dbLogger } = require('../middleware/logging');

// Ensure a single Prisma instance across the app (esp. in dev/hot-reload)
let prisma = global.prisma;

const buildPooledUrl = (raw) => {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const p = url.searchParams;
    // Always enforce SSL
    if (!p.has('sslmode')) p.set('sslmode', 'require');

    const host = url.hostname || '';
    const isSupabasePooler = /supabase|pooler\./i.test(host);
    const isNeonPooler = /neon\.tech/i.test(host) && /pooler/i.test(host);
    const behindPgBouncer = isSupabasePooler || isNeonPooler || /pgbouncer/i.test(p.get('pool_mode') || '');

    if (behindPgBouncer) {
      // When behind PgBouncer in transaction mode, disable prepared statements and use a single connection
      if (!p.has('pgbouncer')) p.set('pgbouncer', 'true');
      if (!p.has('connection_limit')) p.set('connection_limit', '1');
      if (!p.has('pool_timeout')) p.set('pool_timeout', '5');
    } else {
      // Direct connections (e.g., Render Postgres): allow more concurrency and a reasonable timeout
      if (p.has('pgbouncer')) p.delete('pgbouncer');
      if (!p.has('connection_limit')) p.set('connection_limit', process.env.PRISMA_POOL_CONNECTIONS || '10');
      if (!p.has('pool_timeout')) p.set('pool_timeout', process.env.PRISMA_POOL_TIMEOUT || '15');
    }
    url.search = p.toString();
    return url.toString();
  } catch {
    return raw;
  }
};

if (!prisma) {
  const url = buildPooledUrl(process.env.DATABASE_URL);
  const base = new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Wrap with DB logger (non-invasive)
  prisma = dbLogger?.wrapPrisma ? dbLogger.wrapPrisma(base) : base;

  if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
  }
}

module.exports = prisma;
