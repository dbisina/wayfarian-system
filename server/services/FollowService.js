// server/services/FollowService.js
// Following other riders, and inviting a rider to a group ride. Both are small: a follow is one row,
// an invite is a push notification carrying the ride's join code.

const defaultPrisma = require('../prisma/client');
const { RideError } = require('./RideService');

function createFollowService({ prisma = defaultPrisma, sendPush } = {}) {
  const push = sendPush || ((token, title, body, data) => require('./expoPushService').sendPushNotification(token, title, body, data));

  async function requireRider(riderId) {
    if (typeof riderId !== 'string' || !riderId) throw new RideError('invalid_input', 400, 'rider id required');
    const rider = await prisma.user.findUnique({ where: { id: riderId }, select: { id: true, displayName: true, expoPushToken: true } });
    if (!rider) throw new RideError('not_found', 404, 'Rider not found');
    return rider;
  }

  /** How many follow this rider and how many they follow. */
  async function counts(userId) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);
    return { followers, following };
  }

  /** What the viewer needs on another rider's profile. */
  async function relation(viewerId, riderId) {
    const [c, mine] = await Promise.all([
      counts(riderId),
      viewerId === riderId ? null : prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: riderId } } }),
    ]);
    return { ...c, isFollowing: !!mine };
  }

  /** Idempotent: following twice is harmless. */
  async function follow(viewerId, riderId) {
    if (viewerId === riderId) throw new RideError('invalid_input', 400, 'You cannot follow yourself');
    const rider = await requireRider(riderId);
    const existing = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: riderId } } });
    if (!existing) {
      await prisma.follow.create({ data: { followerId: viewerId, followingId: riderId } });
      // Best effort: a failed notification never fails the follow.
      const me = await prisma.user.findUnique({ where: { id: viewerId }, select: { displayName: true } }).catch(() => null);
      if (rider.expoPushToken) {
        Promise.resolve(push(rider.expoPushToken, 'New follower', `${me?.displayName || 'A rider'} started following you`, { type: 'NEW_FOLLOWER', userId: viewerId })).catch(() => {});
      }
    }
    return relation(viewerId, riderId);
  }

  async function unfollow(viewerId, riderId) {
    await requireRider(riderId);
    await prisma.follow.deleteMany({ where: { followerId: viewerId, followingId: riderId } });
    return relation(viewerId, riderId);
  }

  /**
   * Invites a rider to a group ride the caller is part of. The rider gets a notification with the
   * join code. `delivered` is false when they have no notification token, so the app can offer the
   * code to share instead.
   */
  async function invite(viewerId, riderId, groupRideId) {
    if (viewerId === riderId) throw new RideError('invalid_input', 400, 'You cannot invite yourself');
    if (typeof groupRideId !== 'string' || !groupRideId) throw new RideError('invalid_input', 400, 'groupRideId is required');
    const rider = await requireRider(riderId);
    const ride = await prisma.groupRide.findUnique({ where: { id: groupRideId } });
    if (!ride) throw new RideError('not_found', 404, 'Group ride not found');
    if (ride.status === 'ENDED' || ride.status === 'CANCELLED') throw new RideError('conflict', 409, 'That group ride is over');
    const mine = await prisma.groupRideParticipant.findUnique({ where: { groupRideId_userId: { groupRideId, userId: viewerId } } });
    if (!mine || mine.leftAt) throw new RideError('forbidden', 403, 'You are not part of that group ride');

    const me = await prisma.user.findUnique({ where: { id: viewerId }, select: { displayName: true } });
    let delivered = false;
    if (rider.expoPushToken) {
      const res = await push(rider.expoPushToken, `${me?.displayName || 'A rider'} invited you to ride`, ride.title, { type: 'GROUP_RIDE_INVITE', groupRideId, code: ride.code });
      delivered = !!(res && res.success);
    }
    return { delivered, code: ride.code, rider: { id: rider.id, displayName: rider.displayName } };
  }

  return { counts, relation, follow, unfollow, invite };
}

module.exports = { createFollowService };
