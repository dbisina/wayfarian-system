// server/services/redisV2.js
// Optional shared Redis connection for the v2 leaderboard cache. Returns null when REDIS_URL is
// not set, and callers must work without it.
//
// The cache must never make a request slower or hang it. So this connection fails fast: with no
// working connection a command is rejected straight away (callers fall back to the database),
// instead of waiting in a queue until Redis comes back. BullMQ opens its own connection (it needs
// different settings), see jobs/v2Jobs.js.

const IORedis = require('ioredis');

let client = null;
let lastWarnAt = 0;

function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = new IORedis(url, {
    enableOfflineQueue: false, // not connected: reject immediately, do not queue
    maxRetriesPerRequest: 1,
    commandTimeout: 1500, // a slow Redis must not slow the API either
    connectTimeout: 5000,
    retryStrategy: (attempt) => Math.min(attempt * 1000, 30000), // keep trying in the background
    lazyConnect: false,
  });
  client.on('error', (err) => {
    // A dead host would otherwise log on every retry. One line a minute is enough.
    const now = Date.now();
    if (now - lastWarnAt > 60000) {
      lastWarnAt = now;
      console.warn('[redis-v2] unavailable, serving without the cache:', err.message);
    }
  });
  return client;
}

async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}

module.exports = { getRedis, closeRedis };
