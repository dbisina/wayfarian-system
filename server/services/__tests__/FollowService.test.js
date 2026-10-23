const { createFollowService } = require('../FollowService');

function build({ follows = new Set(), token = 'ExponentPushToken[abc]', ride = { id: 'ride-1', title: 'Night run', code: 'WF7K2Q', status: 'ACTIVE' }, inRide = true } = {}) {
  const key = (a, b) => `${a}>${b}`;
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }) => (where.id === 'ghost' ? null : { id: where.id, displayName: where.id === 'me' ? 'Mia' : 'Tobi', expoPushToken: where.id === 'them' ? token : null })),
    },
    follow: {
      count: jest.fn(async ({ where }) => [...follows].filter((k) => (where.followingId ? k.endsWith(`>${where.followingId}`) : k.startsWith(`${where.followerId}>`))).length),
      findUnique: jest.fn(async ({ where }) => (follows.has(key(where.followerId_followingId.followerId, where.followerId_followingId.followingId)) ? {} : null)),
      create: jest.fn(async ({ data }) => { follows.add(key(data.followerId, data.followingId)); }),
      deleteMany: jest.fn(async ({ where }) => { follows.delete(key(where.followerId, where.followingId)); }),
    },
    groupRide: { findUnique: jest.fn(async () => ride) },
    groupRideParticipant: { findUnique: jest.fn(async () => (inRide ? { leftAt: null } : null)) },
  };
  const sendPush = jest.fn().mockResolvedValue({ success: true });
  return { prisma, sendPush, svc: createFollowService({ prisma, sendPush }), follows };
}

describe('follow', () => {
  test('following is idempotent, counted both ways, and notifies once', async () => {
    const { svc, sendPush, prisma } = build();
    const first = await svc.follow('me', 'them');
    expect(first).toMatchObject({ isFollowing: true, followers: 1 });
    await svc.follow('me', 'them');
    expect(prisma.follow.create).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush.mock.calls[0][2]).toBe('Mia started following you');
    expect(await svc.counts('me')).toEqual({ followers: 0, following: 1 });
  });

  test('you cannot follow yourself or someone who does not exist', async () => {
    const { svc } = build();
    await expect(svc.follow('me', 'me')).rejects.toMatchObject({ status: 400 });
    await expect(svc.follow('me', 'ghost')).rejects.toMatchObject({ status: 404 });
  });

  test('unfollowing removes the follow and is harmless when there was none', async () => {
    const { svc } = build({ follows: new Set(['me>them']) });
    expect((await svc.unfollow('me', 'them')).isFollowing).toBe(false);
    expect((await svc.unfollow('me', 'them')).isFollowing).toBe(false);
  });

  test('a failed notification never fails the follow', async () => {
    const { svc, sendPush } = build();
    sendPush.mockRejectedValue(new Error('push down'));
    await expect(svc.follow('me', 'them')).resolves.toMatchObject({ isFollowing: true });
  });

  test('relation reports whether the viewer follows, and nothing for your own profile', async () => {
    const { svc } = build({ follows: new Set(['me>them', 'x>them']) });
    expect(await svc.relation('me', 'them')).toEqual({ followers: 2, following: 0, isFollowing: true });
    expect((await svc.relation('them', 'them')).isFollowing).toBe(false);
  });
});

describe('invite', () => {
  test('sends the join code to the rider and reports it delivered', async () => {
    const { svc, sendPush } = build();
    const res = await svc.invite('me', 'them', 'ride-1');
    expect(res).toMatchObject({ delivered: true, code: 'WF7K2Q' });
    expect(sendPush).toHaveBeenCalledWith('ExponentPushToken[abc]', 'Mia invited you to ride', 'Night run', { type: 'GROUP_RIDE_INVITE', groupRideId: 'ride-1', code: 'WF7K2Q' });
  });

  test('without a notification token it is not delivered, but the code comes back to share', async () => {
    const { svc, sendPush } = build({ token: null });
    const res = await svc.invite('me', 'them', 'ride-1');
    expect(res).toMatchObject({ delivered: false, code: 'WF7K2Q' });
    expect(sendPush).not.toHaveBeenCalled();
  });

  test('only a rider in the group ride can invite, and not to a finished ride', async () => {
    await expect(build({ inRide: false }).svc.invite('me', 'them', 'ride-1')).rejects.toMatchObject({ status: 403 });
    await expect(build({ ride: { id: 'r', title: 't', code: 'C', status: 'ENDED' } }).svc.invite('me', 'them', 'r')).rejects.toMatchObject({ status: 409 });
    await expect(build().svc.invite('me', 'me', 'ride-1')).rejects.toMatchObject({ status: 400 });
    await expect(build().svc.invite('me', 'them', '')).rejects.toMatchObject({ status: 400 });
  });
});
