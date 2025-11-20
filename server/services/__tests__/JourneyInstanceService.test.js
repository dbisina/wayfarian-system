jest.mock('../../prisma/client', () => ({
  journeyInstance: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
}));

const prisma = require('../../prisma/client');
const {
  fetchInstanceWithUser,
  buildMemberSnapshot,
} = require('../JourneyInstanceService');

describe('JourneyInstanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchInstanceWithUser', () => {
    it('throws when identifiers are missing', async () => {
      await expect(fetchInstanceWithUser()).rejects.toThrow('groupJourneyId and userId are required');
    });

    it('requests the related user fields', async () => {
      const mockInstance = { id: 'inst', userId: 'user', user: { id: 'user' } };
      prisma.journeyInstance.findFirst.mockResolvedValue(mockInstance);

      const result = await fetchInstanceWithUser('group', 'user');

      expect(prisma.journeyInstance.findFirst).toHaveBeenCalledWith({
        where: { groupJourneyId: 'group', userId: 'user' },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              photoURL: true,
            },
          },
        },
      });
      expect(result).toBe(mockInstance);
    });
  });

  describe('buildMemberSnapshot', () => {
    it('maps journey instances into socket-friendly snapshots', async () => {
      const now = new Date();
      prisma.journeyInstance.findMany.mockResolvedValue([
        {
          id: 'inst-1',
          userId: 'user-1',
          status: 'ACTIVE',
          currentLatitude: 10,
          currentLongitude: 20,
          totalDistance: 100,
          totalTime: 360,
          lastLocationUpdate: now,
          user: { id: 'user-1', displayName: 'One', photoURL: 'one.jpg' },
        },
      ]);

      const snapshot = await buildMemberSnapshot('group');

      expect(prisma.journeyInstance.findMany).toHaveBeenCalledWith({
        where: { groupJourneyId: 'group' },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              photoURL: true,
            },
          },
        },
      });
      expect(snapshot).toEqual([
        {
          instanceId: 'inst-1',
          userId: 'user-1',
          displayName: 'One',
          photoURL: 'one.jpg',
          status: 'ACTIVE',
          latitude: 10,
          longitude: 20,
          totalDistance: 100,
          totalTime: 360,
          lastUpdate: now.toISOString(),
        },
      ]);
    });

    it('throws when missing groupJourneyId', async () => {
      await expect(buildMemberSnapshot()).rejects.toThrow('groupJourneyId is required');
    });
  });
});
