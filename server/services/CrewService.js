// server/services/CrewService.js
// A crew is a persistent group (the existing Group). Its rides are ordinary v2 group rides linked to
// the crew, so the live view, recording, stats and summaries are the same code as any group ride.
// This service adds what a crew needs on top: who may start and join, the live state shown on the
// Groups screens, the weekly quest, and the activity feed with messages.

const defaultPrisma = require('../prisma/client');
const { RideError } = require('./RideService');
const { MIN_COUNTED_DISTANCE_M } = require('../constants/rideXp');

const QUEST_TARGET_KM = 500;
const MAX_MESSAGE_LENGTH = 500;
const LIVE_STATUSES = ['PLANNED', 'ACTIVE'];

/** Monday 00:00 UTC of the week containing `now`, and the next Monday. The quest runs Monday to Sunday. */
function weekWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - sinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function createCrewService({ prisma = defaultPrisma, groupRides, now = () => new Date() } = {}) {
  if (!groupRides) throw new Error('CrewService needs the group ride service');

  async function membership(db, userId, crewId) {
    if (typeof crewId !== 'string' || !crewId) throw new RideError('invalid_input', 400, 'crewId is required');
    const m = await db.groupMember.findUnique({ where: { userId_groupId: { userId, groupId: crewId } } });
    if (!m) throw new RideError('forbidden', 403, 'You are not in this group');
    return m;
  }

  const liveRideOf = (db, crewId) =>
    db.groupRide.findFirst({ where: { crewId, status: { in: LIVE_STATUSES } }, orderBy: { createdAt: 'desc' } });

  /**
   * Starts a ride for the crew, or returns the one already running so two members who tap Start
   * together end up in the same ride. The starter leads it and is its first rider.
   */
  async function startRide(userId, crewId, input = {}) {
    await membership(prisma, userId, crewId);
    const live = await liveRideOf(prisma, crewId);
    if (live) {
      if (live.status === 'PLANNED' && live.leaderId === userId) return groupRides.start(userId, live.id);
      return live.leaderId === userId ? live : groupRides.join(userId, live.code);
    }
    const crew = await prisma.group.findUnique({ where: { id: crewId }, select: { name: true } });
    const created = await groupRides.create(userId, input.id, { ...input, title: input.title || crew?.name || 'Group ride' });
    // Link before starting so nobody sees a running ride that is not the crew's.
    await prisma.groupRide.update({ where: { id: created.id }, data: { crewId } });
    return groupRides.start(userId, created.id);
  }

  /** A crew member joins the crew's running ride without needing its code. */
  async function joinRide(userId, crewId) {
    await membership(prisma, userId, crewId);
    const live = await liveRideOf(prisma, crewId);
    if (!live) throw new RideError('not_found', 404, 'No ride is running for this group');
    return groupRides.join(userId, live.code);
  }

  /** The ride's leader, or a crew admin, can end it. Ending always runs as the leader so the existing rules apply. */
  async function endRide(userId, crewId) {
    const m = await membership(prisma, userId, crewId);
    const live = await liveRideOf(prisma, crewId);
    if (!live) throw new RideError('not_found', 404, 'No ride is running for this group');
    if (live.leaderId !== userId && m.role === 'MEMBER') throw new RideError('forbidden', 403, 'Only the leader or a group admin can end the ride');
    return groupRides.end(live.leaderId, live.id);
  }

  async function quest(crewId) {
    const { start, end } = weekWindow(now());
    const rides = await prisma.ride.groupBy({
      by: ['userId'],
      where: {
        groupRide: { crewId },
        status: 'FINALIZED',
        distanceM: { gte: MIN_COUNTED_DISTANCE_M },
        startedAt: { gte: start, lt: end },
      },
      _sum: { distanceM: true },
    });
    const users = rides.length
      ? await prisma.user.findMany({ where: { id: { in: rides.map((r) => r.userId) } }, select: { id: true, displayName: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    const riders = rides
      .map((r) => ({ userId: r.userId, displayName: names.get(r.userId) || 'Rider', km: Math.round(((r._sum.distanceM || 0) / 1000) * 10) / 10 }))
      .sort((a, b) => b.km - a.km);
    const totalKm = Math.round(riders.reduce((a, r) => a + r.km, 0) * 10) / 10;
    return { targetKm: QUEST_TARGET_KM, endsAt: end.toISOString(), totalKm, kmToGo: Math.max(0, Math.round((QUEST_TARGET_KM - totalKm) * 10) / 10), riders };
  }

  /** What the crew screens need in one call. */
  async function getState(userId, crewId) {
    await membership(prisma, userId, crewId);
    const live = await liveRideOf(prisma, crewId);
    let activeRide = null;
    if (live) {
      const [riding, mine] = await Promise.all([
        prisma.groupRideParticipant.count({ where: { groupRideId: live.id, leftAt: null } }),
        prisma.groupRideParticipant.findUnique({ where: { groupRideId_userId: { groupRideId: live.id, userId } } }),
      ]);
      activeRide = {
        id: live.id, title: live.title, status: live.status, leaderId: live.leaderId,
        destinationName: live.destinationName, startedAt: live.startedAt, riding, joined: !!mine && !mine.leftAt,
      };
    }
    return { activeRide, quest: await quest(crewId) };
  }

  /** Messages, rides and new members merged newest first. */
  async function activity(userId, crewId, { limit = 30 } = {}) {
    await membership(prisma, userId, crewId);
    const take = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const [messages, rides, joins] = await Promise.all([
      prisma.groupMessage.findMany({ where: { groupId: crewId }, orderBy: { createdAt: 'desc' }, take, include: { user: { select: { id: true, displayName: true, photoURL: true } } } }),
      prisma.groupRide.findMany({ where: { crewId }, orderBy: { createdAt: 'desc' }, take, include: { leader: { select: { id: true, displayName: true, photoURL: true } }, _count: { select: { participants: true } } } }),
      prisma.groupMember.findMany({ where: { groupId: crewId }, orderBy: { joinedAt: 'desc' }, take, include: { user: { select: { id: true, displayName: true, photoURL: true } } } }),
    ]);
    const items = [
      ...messages.map((m) => ({ id: `m:${m.id}`, type: 'message', at: m.createdAt, user: m.user, text: m.body })),
      ...rides.map((r) => ({
        id: `r:${r.id}`, type: 'ride', at: r.startedAt || r.createdAt, user: r.leader,
        ride: { id: r.id, title: r.title, status: r.status, destinationName: r.destinationName, riders: r._count.participants },
      })),
      ...joins.map((j) => ({ id: `j:${j.id}`, type: 'joined', at: j.joinedAt, user: j.user })),
    ];
    return { items: items.sort((a, b) => b.at - a.at).slice(0, take) };
  }

  async function postMessage(userId, crewId, body) {
    await membership(prisma, userId, crewId);
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) throw new RideError('invalid_input', 400, 'message is empty');
    if (text.length > MAX_MESSAGE_LENGTH) throw new RideError('invalid_input', 400, `message is longer than ${MAX_MESSAGE_LENGTH} characters`);
    const m = await prisma.groupMessage.create({
      data: { groupId: crewId, userId, body: text },
      include: { user: { select: { id: true, displayName: true, photoURL: true } } },
    });
    return { id: `m:${m.id}`, type: 'message', at: m.createdAt, user: m.user, text: m.body };
  }

  return { startRide, joinRide, endRide, getState, quest, activity, postMessage };
}

module.exports = { createCrewService, weekWindow, QUEST_TARGET_KM };
