// server/services/rideServices.js
// Wires the v2 services together with the shared Prisma client and optional Redis.

const { createRideService, RideError } = require('./RideService');
const { createGroupRideService } = require('./GroupRideService');
const { createProfileServices } = require('./ProfileServicesV2');
const { createLeaderboardService, LeaderboardError } = require('./LeaderboardServiceV2');
const { getRedis } = require('./redisV2');

const leaderboards = createLeaderboardService({ redis: getRedis() });
const rideService = createRideService({ onStatsChanged: () => leaderboards.invalidate() });

const groupRides = createGroupRideService({ rideService });
const profiles = createProfileServices({ rideService, leaderboards });

module.exports = { rideService, groupRides, profiles, leaderboards, RideError, LeaderboardError };
