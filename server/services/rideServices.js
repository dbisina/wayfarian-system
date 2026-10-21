// server/services/rideServices.js
// Wires the v2 services together with the shared Prisma client and optional Redis.

const { createRideService, RideError } = require('./RideService');
const { createLeaderboardService, LeaderboardError } = require('./LeaderboardServiceV2');
const { getRedis } = require('./redisV2');

const leaderboards = createLeaderboardService({ redis: getRedis() });
const rideService = createRideService({ onStatsChanged: () => leaderboards.invalidate() });

module.exports = { rideService, leaderboards, RideError, LeaderboardError };
