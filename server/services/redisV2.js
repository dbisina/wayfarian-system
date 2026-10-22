// server/services/redisV2.js
// Optional shared Redis connection for v2 caching and job queues. Returns null when
// REDIS_URL is not set, and callers must work without it.

const IORedis = require('ioredis');

let client = null;

function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = new IORedis(url, {
    // BullMQ requires null here; plain commands still fail fast because of the offline queue.
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  client.on('error', (err) => console.warn('[redis-v2]', err.message));
  return client;
}

async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}

module.exports = { getRedis, closeRedis };
