// server/services/rideServices.js
// Wires the v2 services together with the shared Prisma client and optional Redis.

const { createRideService, RideError } = require('./RideService');
const { createGroupRideService } = require('./GroupRideService');
const { createCrewService } = require('./CrewService');
const { createFollowService } = require('./FollowService');
const { createProfileServices } = require('./ProfileServicesV2');
const { createRidePhotoService, defaultDeps: photoDeps } = require('./RidePhotoService');
const { createLeaderboardService, LeaderboardError } = require('./LeaderboardServiceV2');
const { getRedis } = require('./redisV2');

const leaderboards = createLeaderboardService({ redis: getRedis() });
const rideService = createRideService({ onStatsChanged: () => leaderboards.invalidate() });

const groupRides = createGroupRideService({ rideService });
const crews = createCrewService({ groupRides });
const follows = createFollowService();
const profiles = createProfileServices({ rideService, leaderboards });
// sharp and the storage client load lazily so a server without them still boots
let photoService = null;
const photos = () => (photoService ||= createRidePhotoService(photoDeps()));

module.exports = { rideService, groupRides, crews, follows, profiles, photos, leaderboards, RideError, LeaderboardError };
