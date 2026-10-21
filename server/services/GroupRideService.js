// server/services/GroupRideService.js
//
// v2 group rides. A group ride is only membership, a leader, an optional destination and a
// lifecycle. Each rider records an ordinary Ride (Ride.groupRideId) through RideService, so a
// group ride cannot disagree with solo stats. The group summary is computed from those
// finalized rides on every read; nothing is stored twice.

const crypto = require('crypto');
const defaultPrisma = require('../prisma/client');
const { RideError } = require('./RideService');

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 6;
const OPEN_RIDE_STATUSES = ['RECORDING', 'PAUSED', 'ENDED'];

const assertId = (id, field = 'id') => {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new RideError('invalid_input', 400, `${field} must be 8-64 chars of letters, digits, _ or -`);
  }
};

const generateCode = () => {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
};

const optionalDate = (v, field) => {
  if (v == null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new RideError('invalid_input', 400, `${field} must be a valid date`);
  return d;
};

const inRange = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

function createGroupRideService({ prisma = defaultPrisma, rideService } = {}) {
  if (!rideService) throw new Error('GroupRideService needs a rideService');

  async function load(db, id) {
    const g = await db.groupRide.findUnique({ where: { id } });
    if (!g) throw new RideError('not_found', 404, 'Group ride not found');
    return g;
  }

  async function participantOf(db, groupRideId, userId) {
    return db.groupRideParticipant.findUnique({ where: { groupRideId_userId: { groupRideId, userId } } });
  }

  const requireMember = async (db, groupRideId, userId) => {
    const p = await participantOf(db, groupRideId, userId);
    if (!p) throw new RideError('forbidden', 403, 'Not part of this group ride');
    return p;
  };

  const requireLeader = async (db, groupRideId, userId) => {
    const g = await load(db, groupRideId);
    if (g.leaderId !== userId) throw new RideError('forbidden', 403, 'Only the leader can do this');
    return g;
  };

  /** Idempotent create. The creator becomes the leader and the first participant. */
  async function create(userId, id, input = {}) {
    assertId(id, 'groupRideId');
    const existing = await prisma.groupRide.findUnique({ where: { id } });
    if (existing) {
      if (existing.leaderId !== userId) throw new RideError('forbidden', 403, 'Not your group ride');
      return existing;
    }

    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
    if (!title) throw new RideError('invalid_input', 400, 'title is required');

    const hasLat = input.destinationLat != null;
    const hasLng = input.destinationLng != null;
    if (hasLat !== hasLng) throw new RideError('invalid_input', 400, 'destinationLat and destinationLng go together');
    if (hasLat && !(inRange(input.destinationLat, -90, 90) && inRange(input.destinationLng, -180, 180))) {
      throw new RideError('invalid_input', 400, 'destination coordinates are out of range');
    }
    const maxParticipants = input.maxParticipants == null ? 20 : input.maxParticipants;
    if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 50) {
      throw new RideError('invalid_input', 400, 'maxParticipants must be an integer from 2 to 50');
    }
    const scheduledAt = optionalDate(input.scheduledAt, 'scheduledAt');

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const group = await tx.groupRide.create({
            data: {
              id,
              leaderId: userId,
              title,
              code: generateCode(),
              maxParticipants,
              scheduledAt,
              destinationName: typeof input.destinationName === 'string' ? input.destinationName.slice(0, 160) : null,
              destinationLat: hasLat ? input.destinationLat : null,
              destinationLng: hasLng ? input.destinationLng : null,
            },
          });
          await tx.groupRideParticipant.create({ data: { groupRideId: id, userId, role: 'LEADER' } });
          return group;
        });
      } catch (err) {
        if (err && err.code === 'P2002') {
          // Either a retry of this same create raced us, or the code collided.
          const raced = await prisma.groupRide.findUnique({ where: { id } });
          if (raced) {
            if (raced.leaderId !== userId) throw new RideError('forbidden', 403, 'Not your group ride');
            return raced;
          }
          continue;
        }
        throw err;
      }
    }
    throw new RideError('internal', 500, 'Could not allocate an invite code');
  }

  /** Join by invite code. Joining twice is harmless; a rider who left can come back. */
  async function join(userId, code) {
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!normalized) throw new RideError('invalid_input', 400, 'code is required');

    return prisma.$transaction(async (tx) => {
      const group = await tx.groupRide.findUnique({ where: { code: normalized } });
      if (!group) throw new RideError('not_found', 404, 'No group ride has that code');
      if (group.status === 'ENDED' || group.status === 'CANCELLED') {
        throw new RideError('conflict', 409, 'This group ride is over');
      }

      const existing = await participantOf(tx, group.id, userId);
      if (existing && !existing.leftAt) return group;

      const active = await tx.groupRideParticipant.count({ where: { groupRideId: group.id, leftAt: null } });
      if (active >= group.maxParticipants) throw new RideError('conflict', 409, 'This group ride is full');

      if (existing) {
        await tx.groupRideParticipant.update({ where: { id: existing.id }, data: { leftAt: null } });
      } else {
        await tx.groupRideParticipant.create({ data: { groupRideId: group.id, userId } });
      }
      return group;
    });
  }

  /**
   * Leaves the group. The leader's role passes to the longest-standing rider; if nobody is
   * left the group ride is cancelled. The leaver's own rides stay and still count for them.
   */
  async function leave(userId, groupRideId) {
    assertId(groupRideId, 'groupRideId');
    return prisma.$transaction(async (tx) => {
      const group = await load(tx, groupRideId);
      const me = await requireMember(tx, groupRideId, userId);
      if (me.leftAt) return group;

      await tx.groupRideParticipant.update({ where: { id: me.id }, data: { leftAt: new Date(), role: 'MEMBER' } });
      if (group.leaderId !== userId) return group;

      const others = await tx.groupRideParticipant.findMany({
        where: { groupRideId, leftAt: null, userId: { not: userId } },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        take: 1,
      });
      if (others.length) {
        await tx.groupRideParticipant.update({ where: { id: others[0].id }, data: { role: 'LEADER' } });
        return tx.groupRide.update({ where: { id: groupRideId }, data: { leaderId: others[0].userId } });
      }
      if (group.status === 'ENDED' || group.status === 'CANCELLED') return group;
      return tx.groupRide.update({ where: { id: groupRideId }, data: { status: 'CANCELLED', endedAt: new Date() } });
    });
  }

  /** PLANNED -> ACTIVE. Idempotent. */
  async function start(userId, groupRideId) {
    assertId(groupRideId, 'groupRideId');
    const group = await requireLeader(prisma, groupRideId, userId);
    if (group.status === 'ACTIVE') return group;
    if (group.status !== 'PLANNED') throw new RideError('conflict', 409, `Cannot start a ${group.status.toLowerCase()} group ride`);
    // The status guard in the WHERE makes concurrent starts safe.
    await prisma.groupRide.updateMany({
      where: { id: groupRideId, status: 'PLANNED' },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });
    return load(prisma, groupRideId);
  }

  /**
   * Ends the group ride (ACTIVE -> ENDED, or PLANNED -> CANCELLED) and finalizes any rider
   * ride still open, through the normal RideService.finalize transaction. A rider whose
   * phone is offline can still upload points later; those re-finalize their own ride.
   */
  async function end(userId, groupRideId) {
    assertId(groupRideId, 'groupRideId');
    const group = await requireLeader(prisma, groupRideId, userId);

    if (group.status === 'PLANNED') {
      await prisma.groupRide.updateMany({ where: { id: groupRideId, status: 'PLANNED' }, data: { status: 'CANCELLED', endedAt: new Date() } });
    } else if (group.status === 'ACTIVE') {
      await prisma.groupRide.updateMany({ where: { id: groupRideId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
    }

    const open = await prisma.ride.findMany({
      where: { groupRideId, status: { in: OPEN_RIDE_STATUSES } },
      select: { id: true, userId: true },
    });
    const failures = [];
    for (const r of open) {
      try {
        await rideService.finalize(r.userId, r.id);
      } catch (err) {
        failures.push({ rideId: r.id, error: err.message });
      }
    }
    return { groupRide: await load(prisma, groupRideId), finalizedRides: open.length - failures.length, failures };
  }

  /** The rider's own ride inside a running group ride. Same idempotent create as a solo ride. */
  async function startRide(userId, groupRideId, rideId, input = {}) {
    assertId(groupRideId, 'groupRideId');
    const group = await load(prisma, groupRideId);
    const me = await requireMember(prisma, groupRideId, userId);
    if (me.leftAt) throw new RideError('forbidden', 403, 'You left this group ride');
    if (group.status !== 'ACTIVE') throw new RideError('conflict', 409, 'The group ride is not running');
    return rideService.upsertRide(userId, rideId, input, { groupRideId });
  }

  async function ridesOf(db, groupRideId) {
    return db.ride.findMany({
      where: { groupRideId, status: { not: 'DELETED' } },
      select: {
        id: true, userId: true, status: true, startedAt: true, endedAt: true,
        distanceM: true, movingTimeS: true, elapsedTimeS: true, topSpeedMps: true, avgSpeedMps: true,
      },
    });
  }

  async function get(userId, groupRideId) {
    assertId(groupRideId, 'groupRideId');
    await requireMember(prisma, groupRideId, userId);
    const group = await load(prisma, groupRideId);
    const [participants, rides] = await Promise.all([
      prisma.groupRideParticipant.findMany({
        where: { groupRideId },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        include: { user: { select: { id: true, displayName: true, photoURL: true } } },
      }),
      ridesOf(prisma, groupRideId),
    ]);
    const rideByUser = new Map(rides.map((r) => [r.userId, r]));
    return {
      ...group,
      participants: participants.map((p) => ({
        userId: p.userId,
        displayName: p.user?.displayName ?? null,
        photoURL: p.user?.photoURL ?? null,
        role: p.role,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
        ride: rideByUser.get(p.userId) || null,
      })),
    };
  }

  /** Aggregates the riders' finalized rides. Computed on read, so it can never drift. */
  async function summary(userId, groupRideId) {
    assertId(groupRideId, 'groupRideId');
    await requireMember(prisma, groupRideId, userId);
    const group = await load(prisma, groupRideId);
    const rides = (await ridesOf(prisma, groupRideId)).filter((r) => r.status === 'FINALIZED');
    const users = await prisma.user.findMany({
      where: { id: { in: rides.map((r) => r.userId) } },
      select: { id: true, displayName: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.displayName]));

    const riders = rides
      .map((r) => ({
        userId: r.userId,
        displayName: nameOf.get(r.userId) ?? null,
        rideId: r.id,
        distanceM: r.distanceM,
        movingTimeS: r.movingTimeS,
        topSpeedMps: r.topSpeedMps,
        avgSpeedMps: r.avgSpeedMps,
      }))
      .sort((a, b) => b.distanceM - a.distanceM || a.userId.localeCompare(b.userId))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const startedAt = group.startedAt;
    const endedAt = group.endedAt;
    return {
      groupRideId,
      status: group.status,
      riderCount: riders.length,
      totalDistanceM: riders.reduce((s, r) => s + r.distanceM, 0),
      totalMovingTimeS: riders.reduce((s, r) => s + r.movingTimeS, 0),
      topSpeedMps: riders.reduce((m, r) => Math.max(m, r.topSpeedMps), 0),
      durationS: startedAt && endedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : null,
      riders,
    };
  }

  async function list(userId, { cursor, limit = 20 } = {}) {
    const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const memberships = await prisma.groupRideParticipant.findMany({ where: { userId }, select: { groupRideId: true } });
    const rows = await prisma.groupRide.findMany({
      where: { id: { in: memberships.map((m) => m.groupRideId) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  /** For the socket layer: may this user receive/send live presence for this group ride? */
  async function isActiveParticipant(userId, groupRideId) {
    if (typeof groupRideId !== 'string') return false;
    const p = await participantOf(prisma, groupRideId, userId);
    return !!p && !p.leftAt;
  }

  return { create, join, leave, start, end, startRide, get, summary, list, isActiveParticipant };
}

module.exports = { createGroupRideService };
