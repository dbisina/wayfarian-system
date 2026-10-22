// server/services/ProfileServicesV2.js
//
// Read models for other riders and for a rider's vehicles. Everything here is derived from
// finalized rides, so it can never disagree with the totals shown elsewhere.

const defaultPrisma = require('../prisma/client');
const { RideError } = require('./RideService');

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DEFAULT_SERVICE_INTERVAL_KM = 2500;
const SERVICE_KINDS = ['service', 'oil', 'tyres', 'chain', 'other'];

function createProfileServices({ prisma = defaultPrisma, rideService, leaderboards } = {}) {
  if (!rideService) throw new Error('ProfileServices needs a rideService');

  const publicStats = async (userId) => {
    const [stats, user, badges, streak] = await Promise.all([
      prisma.userStats.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, photoURL: true, level: true, createdAt: true } }),
      prisma.rideAchievement.count({ where: { userId } }),
      rideService.getStreak(userId),
    ]);
    if (!user) return null;
    return {
      user,
      stats: {
        distanceM: stats?.distanceM || 0,
        topSpeedMps: stats?.topSpeedMps || 0,
        rides: stats?.rides || 0,
        badges,
        streak: streak.current,
      },
    };
  };

  /**
   * Another rider's public profile, with the viewer's own numbers alongside for the
   * side-by-side comparison. Only aggregates and the title/date of their latest ride are
   * shared: never routes, positions or anything private.
   */
  async function getRider(viewerId, riderId) {
    if (typeof riderId !== 'string' || !riderId) throw new RideError('invalid_input', 400, 'rider id required');
    const them = await publicStats(riderId);
    if (!them) throw new RideError('not_found', 404, 'Rider not found');
    const you = viewerId === riderId ? them : await publicStats(viewerId);

    const [latest, vehicle, monthRank] = await Promise.all([
      prisma.ride.findFirst({
        where: { userId: riderId, status: 'FINALIZED', distanceM: { gte: 100 } },
        orderBy: { startedAt: 'desc' },
        select: { title: true, startedAt: true, distanceM: true },
      }),
      prisma.vehicle.findFirst({ where: { userId: riderId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true, name: true, make: true, model: true, type: true, photoURL: true } }),
      leaderboards ? leaderboards.position(riderId, { metric: 'distance', period: 'month' }).catch(() => null) : null,
    ]);

    let vehicleKm = null;
    if (vehicle) {
      const agg = await prisma.ride.aggregate({ where: { vehicleId: vehicle.id, status: 'FINALIZED' }, _sum: { distanceM: true } });
      vehicleKm = (agg._sum.distanceM || 0) / 1000;
    }

    return {
      id: them.user.id,
      displayName: them.user.displayName,
      photoURL: them.user.photoURL,
      level: them.user.level,
      memberSince: them.user.createdAt,
      monthRank: monthRank ? monthRank.rank : null,
      stats: them.stats,
      you: you ? you.stats : null,
      latestRide: latest,
      vehicle: vehicle ? { ...vehicle, rideKm: vehicleKm } : null,
      isSelf: viewerId === riderId,
    };
  }

  async function ownedVehicle(userId, vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw new RideError('not_found', 404, 'Vehicle not found');
    if (v.userId !== userId) throw new RideError('forbidden', 403, 'Not your vehicle');
    return v;
  }

  /** Distance, best speed, longest ride and the service countdown for one vehicle. */
  async function getVehicle(userId, vehicleId) {
    const v = await ownedVehicle(userId, vehicleId);
    const where = { vehicleId, userId, status: 'FINALIZED' };
    const [agg, count, longest, lastService] = await Promise.all([
      prisma.ride.aggregate({ where, _sum: { distanceM: true }, _max: { topSpeedMps: true } }),
      prisma.ride.count({ where: { ...where, distanceM: { gte: 100 } } }),
      prisma.ride.aggregate({ where, _max: { distanceM: true } }),
      prisma.vehicleServiceLog.findFirst({ where: { vehicleId, userId }, orderBy: [{ doneAt: 'desc' }, { createdAt: 'desc' }] }),
    ]);
    const riddenM = agg._sum.distanceM || 0;
    const intervalKm = lastService ? lastService.intervalKm : DEFAULT_SERVICE_INTERVAL_KM;
    const baseM = lastService ? lastService.odometerM : 0;
    const sinceM = Math.max(0, riddenM - baseM);
    const toGoKm = Math.max(0, intervalKm - sinceM / 1000);
    const months = Math.max(0, Math.round((Date.now() - new Date(v.createdAt).getTime()) / (30.44 * 86400000)));
    return {
      id: v.id,
      name: v.name,
      make: v.make,
      model: v.model,
      year: v.year,
      type: v.type,
      photoURL: v.photoURL,
      isDefault: v.isDefault,
      riddenM,
      rides: count,
      topSpeedMps: agg._max.topSpeedMps || 0,
      longestM: longest._max.distanceM || 0,
      ownedMonths: months,
      service: {
        intervalKm,
        toGoKm: Math.round(toGoKm * 10) / 10,
        pct: Math.min(100, Math.round((sinceM / 1000 / intervalKm) * 100)),
        due: toGoKm <= 0,
        last: lastService ? { kind: lastService.kind, doneAt: lastService.doneAt, notes: lastService.notes } : null,
      },
    };
  }

  /** Idempotent: logging the same id twice stores one entry. The odometer is read from rides, not typed in. */
  async function logService(userId, vehicleId, serviceId, input = {}) {
    if (typeof serviceId !== 'string' || !ID_PATTERN.test(serviceId)) throw new RideError('invalid_input', 400, 'serviceId must be 8-64 chars of letters, digits, _ or -');
    await ownedVehicle(userId, vehicleId);
    const existing = await prisma.vehicleServiceLog.findUnique({ where: { id: serviceId } });
    if (existing) {
      if (existing.userId !== userId) throw new RideError('forbidden', 403, 'Not your service entry');
      return existing;
    }
    const kind = input.kind == null ? 'service' : input.kind;
    if (!SERVICE_KINDS.includes(kind)) throw new RideError('invalid_input', 400, `kind must be one of ${SERVICE_KINDS.join(', ')}`);
    const intervalKm = input.intervalKm == null ? DEFAULT_SERVICE_INTERVAL_KM : input.intervalKm;
    if (!Number.isInteger(intervalKm) || intervalKm < 100 || intervalKm > 50000) throw new RideError('invalid_input', 400, 'intervalKm must be an integer from 100 to 50000');
    const doneAt = input.doneAt ? new Date(input.doneAt) : new Date();
    if (Number.isNaN(doneAt.getTime())) throw new RideError('invalid_input', 400, 'doneAt must be a valid date');

    const agg = await prisma.ride.aggregate({ where: { vehicleId, userId, status: 'FINALIZED' }, _sum: { distanceM: true } });
    try {
      return await prisma.vehicleServiceLog.create({
        data: {
          id: serviceId, userId, vehicleId, kind, doneAt, intervalKm,
          odometerM: agg._sum.distanceM || 0,
          notes: typeof input.notes === 'string' ? input.notes.slice(0, 500) : null,
        },
      });
    } catch (err) {
      if (err && err.code === 'P2002') return prisma.vehicleServiceLog.findUnique({ where: { id: serviceId } });
      throw err;
    }
  }

  return { getRider, getVehicle, logService };
}

module.exports = { createProfileServices, DEFAULT_SERVICE_INTERVAL_KM };
