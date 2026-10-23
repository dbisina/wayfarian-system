const { createCrewService, weekWindow, QUEST_TARGET_KM } = require('../CrewService');

const member = (role = 'MEMBER') => ({ userId: 'u1', groupId: 'crew-1', role });

function build({ role = 'MEMBER', live = null, joined = false } = {}) {
  const prisma = {
    groupMember: { findUnique: jest.fn().mockResolvedValue(role ? member(role) : null) },
    groupRide: { findFirst: jest.fn().mockResolvedValue(live), update: jest.fn().mockResolvedValue({}) },
    group: { findUnique: jest.fn().mockResolvedValue({ name: 'Night Riders' }) },
    groupRideParticipant: {
      count: jest.fn().mockResolvedValue(3),
      findUnique: jest.fn().mockResolvedValue(joined ? { leftAt: null } : null),
    },
    groupMessage: { create: jest.fn(async ({ data }) => ({ id: 'x1', createdAt: new Date(), user: { id: data.userId, displayName: 'A' }, ...data })) },
    ride: { groupBy: jest.fn().mockResolvedValue([{ userId: 'u1', _sum: { distanceM: 120_000 } }, { userId: 'u2', _sum: { distanceM: 64_500 } }]) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', displayName: 'Ada' }, { id: 'u2', displayName: 'Bo' }]) },
  };
  const groupRides = {
    create: jest.fn().mockResolvedValue({ id: 'ride-abc-123', code: 'CODE12', leaderId: 'u1' }),
    start: jest.fn(async (u, id) => ({ id, status: 'ACTIVE' })),
    join: jest.fn(async (u, code) => ({ id: 'live-1', code })),
    end: jest.fn().mockResolvedValue({ ok: true }),
  };
  return { prisma, groupRides, crews: createCrewService({ prisma, groupRides, now: () => new Date('2026-10-22T12:00:00Z') }) };
}

describe('weekWindow', () => {
  test('the quest week runs Monday to Monday in UTC', () => {
    const { start, end } = weekWindow(new Date('2026-10-22T12:00:00Z')); // a Thursday
    expect(start.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(weekWindow(new Date('2026-10-25T23:59:00Z')).start.toISOString()).toBe('2026-10-19T00:00:00.000Z'); // Sunday
    expect(weekWindow(new Date('2026-10-26T00:00:00Z')).start.toISOString()).toBe('2026-10-26T00:00:00.000Z'); // new Monday
  });
});

describe('CrewService', () => {
  test('only crew members can use a crew', async () => {
    const { crews } = build({ role: null });
    await expect(crews.getState('u1', 'crew-1')).rejects.toMatchObject({ status: 403 });
    await expect(crews.postMessage('u1', 'crew-1', 'hi')).rejects.toMatchObject({ status: 403 });
    await expect(crews.startRide('u1', 'crew-1', { id: 'ride-abc-123' })).rejects.toMatchObject({ status: 403 });
  });

  test('starting a ride creates a group ride linked to the crew, then starts it', async () => {
    const { crews, prisma, groupRides } = build();
    const res = await crews.startRide('u1', 'crew-1', { id: 'ride-abc-123', destinationName: 'Badagry' });
    expect(groupRides.create).toHaveBeenCalledWith('u1', 'ride-abc-123', expect.objectContaining({ title: 'Night Riders', destinationName: 'Badagry' }));
    expect(prisma.groupRide.update).toHaveBeenCalledWith({ where: { id: 'ride-abc-123' }, data: { crewId: 'crew-1' } });
    expect(groupRides.start).toHaveBeenCalledWith('u1', 'ride-abc-123');
    expect(res.status).toBe('ACTIVE');
  });

  test('starting while the crew is already riding joins that ride instead of making a second one', async () => {
    const { crews, groupRides } = build({ live: { id: 'live-1', code: 'LIVE99', leaderId: 'u9', status: 'ACTIVE' } });
    await crews.startRide('u1', 'crew-1', { id: 'ride-abc-123' });
    expect(groupRides.create).not.toHaveBeenCalled();
    expect(groupRides.join).toHaveBeenCalledWith('u1', 'LIVE99');
  });

  test('joining needs a running ride', async () => {
    const none = build();
    await expect(none.crews.joinRide('u1', 'crew-1')).rejects.toMatchObject({ status: 404 });
    const live = build({ live: { id: 'live-1', code: 'LIVE99', leaderId: 'u9', status: 'ACTIVE' } });
    await live.crews.joinRide('u1', 'crew-1');
    expect(live.groupRides.join).toHaveBeenCalledWith('u1', 'LIVE99');
  });

  test('a plain member cannot end someone else\'s ride, an admin or the leader can', async () => {
    const live = { id: 'live-1', code: 'C', leaderId: 'u9', status: 'ACTIVE' };
    await expect(build({ live }).crews.endRide('u1', 'crew-1')).rejects.toMatchObject({ status: 403 });
    const admin = build({ role: 'ADMIN', live });
    await admin.crews.endRide('u1', 'crew-1');
    expect(admin.groupRides.end).toHaveBeenCalledWith('u9', 'live-1'); // runs as the leader
    const leader = build({ live: { ...live, leaderId: 'u1' } });
    await leader.crews.endRide('u1', 'crew-1');
    expect(leader.groupRides.end).toHaveBeenCalled();
  });

  test('the weekly quest adds up the crew\'s finished rides this week', async () => {
    const { crews, prisma } = build();
    const q = await crews.quest('crew-1');
    expect(q.targetKm).toBe(QUEST_TARGET_KM);
    expect(q.totalKm).toBe(184.5);
    expect(q.kmToGo).toBe(315.5);
    expect(q.riders.map((r) => [r.displayName, r.km])).toEqual([['Ada', 120], ['Bo', 64.5]]);
    const where = prisma.ride.groupBy.mock.calls[0][0].where;
    expect(where.groupRide).toEqual({ crewId: 'crew-1' });
    expect(where.startedAt.gte.toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  test('messages are trimmed, must have text and have a length limit', async () => {
    const { crews, prisma } = build();
    const m = await crews.postMessage('u1', 'crew-1', '  hello crew  ');
    expect(prisma.groupMessage.create.mock.calls[0][0].data.body).toBe('hello crew');
    expect(m.text).toBe('hello crew');
    await expect(crews.postMessage('u1', 'crew-1', '   ')).rejects.toMatchObject({ status: 400 });
    await expect(crews.postMessage('u1', 'crew-1', 'x'.repeat(501))).rejects.toMatchObject({ status: 400 });
  });

  test('state reports the live ride and whether you are in it', async () => {
    const { crews } = build({ live: { id: 'live-1', title: 'Badagry', status: 'ACTIVE', leaderId: 'u9', destinationName: null, startedAt: new Date() }, joined: true });
    const s = await crews.getState('u1', 'crew-1');
    expect(s.activeRide).toMatchObject({ id: 'live-1', riding: 3, joined: true });
    expect(s.quest.totalKm).toBe(184.5);
  });
});
