const { createQuestService, WEEKLY_XP_TARGET, CHEST_REWARD_XP } = require('../QuestService');

function build({ weekXp = 460, claimed = false, userXp = 1000, failCreateWith = null } = {}) {
  const tx = {
    xpLedger: { create: jest.fn(async () => { if (failCreateWith) throw failCreateWith; }) },
    user: { findUnique: jest.fn(async () => ({ xp: userXp })), update: jest.fn() },
  };
  const prisma = {
    xpLedger: {
      aggregate: jest.fn(async () => ({ _sum: { amount: weekXp } })),
      findUnique: jest.fn(async () => (claimed ? { id: 'c' } : null)),
    },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  return { prisma, tx, svc: createQuestService({ prisma, now: () => new Date('2026-10-22T12:00:00Z') }) };
}

describe('weekly quest', () => {
  test('reports XP this week, what is left and when it resets', async () => {
    const { svc, prisma } = build({ weekXp: 460 });
    const w = await svc.week('u1');
    expect(w).toMatchObject({ xp: 460, target: WEEKLY_XP_TARGET, xpToGo: 340, resetsAt: '2026-10-26T00:00:00.000Z' });
    expect(w.chest).toEqual({ unlocked: false, claimed: false, rewardXp: CHEST_REWARD_XP });
    const where = prisma.xpLedger.aggregate.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(where.NOT).toEqual({ source: { startsWith: 'chest:' } }); // chest rewards do not count toward the goal
  });

  test('the chest unlocks at the target', async () => {
    expect((await build({ weekXp: 800 }).svc.week('u1')).chest.unlocked).toBe(true);
    expect((await build({ weekXp: 799 }).svc.week('u1')).chest.unlocked).toBe(false);
    expect((await build({ weekXp: 1200 }).svc.week('u1')).xpToGo).toBe(0);
  });

  test('a locked chest cannot be opened', async () => {
    await expect(build({ weekXp: 100 }).svc.openChest('u1')).rejects.toMatchObject({ status: 409 });
  });

  test('opening the chest pays the reward once and records it for this week', async () => {
    const { svc, tx } = build({ weekXp: 900, userXp: 1000 });
    await svc.openChest('u1');
    expect(tx.xpLedger.create).toHaveBeenCalledWith({ data: { userId: 'u1', source: 'chest:2026-10-19', amount: CHEST_REWARD_XP } });
    expect(tx.user.update.mock.calls[0][0].data.xp).toBe(1000 + CHEST_REWARD_XP);
  });

  test('an already opened chest pays nothing more, and a double tap pays once', async () => {
    const opened = build({ weekXp: 900, claimed: true });
    await opened.svc.openChest('u1');
    expect(opened.prisma.$transaction).not.toHaveBeenCalled();

    const race = build({ weekXp: 900, failCreateWith: Object.assign(new Error('unique'), { code: 'P2002' }) });
    await expect(race.svc.openChest('u1')).resolves.toBeDefined();
    expect(race.tx.user.update).not.toHaveBeenCalled();
  });
});
