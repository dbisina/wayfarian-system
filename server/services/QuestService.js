// server/services/QuestService.js
// The weekly XP goal and its chest. XP earned this week comes from the XP ledger (rides and badges),
// not counting chest rewards themselves. Reaching the goal unlocks a chest that can be opened once
// per week for bonus XP; the ledger's unique (user, source) key makes opening it safe to retry.

const defaultPrisma = require('../prisma/client');
const { RideError } = require('./RideService');
const { calculateLevel } = require('../constants/xpSystem');
const { weekWindow } = require('./CrewService');

const WEEKLY_XP_TARGET = 800;
const CHEST_REWARD_XP = 100;
const CHEST_PREFIX = 'chest:';

function createQuestService({ prisma = defaultPrisma, now = () => new Date() } = {}) {
  const chestSource = (start) => `${CHEST_PREFIX}${start.toISOString().slice(0, 10)}`;

  async function week(userId) {
    const { start, end } = weekWindow(now());
    const [sum, claimed] = await Promise.all([
      prisma.xpLedger.aggregate({
        where: { userId, createdAt: { gte: start, lt: end }, NOT: { source: { startsWith: CHEST_PREFIX } } },
        _sum: { amount: true },
      }),
      prisma.xpLedger.findUnique({ where: { userId_source: { userId, source: chestSource(start) } } }),
    ]);
    const xp = sum._sum.amount || 0;
    return {
      xp,
      target: WEEKLY_XP_TARGET,
      xpToGo: Math.max(0, WEEKLY_XP_TARGET - xp),
      resetsAt: end.toISOString(),
      chest: { unlocked: xp >= WEEKLY_XP_TARGET, claimed: !!claimed, rewardXp: CHEST_REWARD_XP },
    };
  }

  /** Opens this week's chest. Idempotent: opening it twice pays once. */
  async function openChest(userId) {
    const state = await week(userId);
    if (!state.chest.unlocked) throw new RideError('conflict', 409, 'The chest is still locked');
    if (state.chest.claimed) return state;

    const { start } = weekWindow(now());
    try {
      await prisma.$transaction(async (tx) => {
        await tx.xpLedger.create({ data: { userId, source: chestSource(start), amount: CHEST_REWARD_XP } });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
        const xp = (user?.xp || 0) + CHEST_REWARD_XP;
        await tx.user.update({ where: { id: userId }, data: { xp, level: calculateLevel(xp) } });
      });
    } catch (err) {
      // Two taps at once: the second hits the unique key and the first already paid.
      if (!(err && err.code === 'P2002')) throw err;
    }
    return week(userId);
  }

  return { week, openChest };
}

module.exports = { createQuestService, WEEKLY_XP_TARGET, CHEST_REWARD_XP };
