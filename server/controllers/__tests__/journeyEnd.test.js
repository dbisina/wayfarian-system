jest.mock('../../prisma/client', () => {
  const tx = {
    journey: { updateMany: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  return {
    journey: { findFirst: jest.fn(), findUnique: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn((fn) => fn(tx)),
    __tx: tx,
  };
});
jest.mock('../../services/achievementService', () => ({
  checkAndAwardAchievements: jest.fn().mockResolvedValue([]),
  updateStreak: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../../prisma/client');
const { endJourney } = require('../journeyController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const activeJourney = {
  id: 'j1',
  userId: 'u1',
  status: 'ACTIVE',
  startTime: new Date(Date.now() - 3600 * 1000),
  routePoints: [],
  topSpeed: 0,
};
const req = (body) => ({ params: { journeyId: 'j1' }, body, user: { id: 'u1', topSpeed: 0 } });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.journey.findFirst.mockResolvedValue(activeJourney);
  prisma.journey.findUnique.mockResolvedValue({ ...activeJourney, status: 'COMPLETED' });
  prisma.__tx.user.findUnique.mockResolvedValue({ topSpeed: 90 });
});

test('credits user totals once inside the transaction', async () => {
  prisma.__tx.journey.updateMany.mockResolvedValue({ count: 1 });
  await endJourney(req({ totalDistance: 40, totalTime: 3600, topSpeed: 120, avgSpeed: 40 }), mockRes());
  expect(prisma.__tx.user.update).toHaveBeenCalledTimes(1);
  const data = prisma.__tx.user.update.mock.calls[0][0].data;
  expect(data.totalDistance).toEqual({ increment: 40 });
  expect(data.totalTrips).toEqual({ increment: 1 });
  expect(data.topSpeed).toBe(120);
});

test('a lost race does not credit the user a second time', async () => {
  prisma.__tx.journey.updateMany.mockResolvedValue({ count: 0 });
  const res = mockRes();
  await endJourney(req({ totalDistance: 40, totalTime: 3600 }), res);
  expect(prisma.__tx.user.update).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Journey already completed' }));
});

test('personal top speed never decreases and absurd speeds are capped', async () => {
  prisma.__tx.journey.updateMany.mockResolvedValue({ count: 1 });
  await endJourney(req({ totalDistance: 10, totalTime: 3600, topSpeed: 50 }), mockRes());
  expect(prisma.__tx.user.update.mock.calls[0][0].data.topSpeed).toBe(90);

  prisma.__tx.user.update.mockClear();
  await endJourney(req({ totalDistance: 10, totalTime: 3600, topSpeed: 9999, avgSpeed: 9999 }), mockRes());
  const saved = prisma.__tx.journey.updateMany.mock.calls[1][0].data;
  expect(saved.topSpeed).toBe(250);
  expect(saved.avgSpeed).toBeLessThanOrEqual(250);
});
