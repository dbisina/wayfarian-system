const { createRidePhotoService } = require('../RidePhotoService');

function build({ groups, rides, photos }) {
  const prisma = {
    ridePhoto: {
      groupBy: jest.fn().mockResolvedValue(groups),
      findMany: jest.fn().mockResolvedValue(photos),
    },
    ride: { findMany: jest.fn().mockResolvedValue(rides) },
  };
  return { prisma, svc: createRidePhotoService({ prisma, storage: {}, imaging: {}, urlFor: (p) => `https://cdn/${p}` }) };
}

describe('listAlbums', () => {
  test('lists rides with photos newest first, with a cover and a count', async () => {
    const { svc, prisma } = build({
      groups: [
        { rideId: 'r2', _count: { _all: 3 }, _max: { takenAt: new Date('2026-10-22') } },
        { rideId: 'r1', _count: { _all: 1 }, _max: { takenAt: new Date('2026-10-01') } },
      ],
      rides: [
        { id: 'r1', title: 'Dawn run', startedAt: new Date('2026-10-01'), distanceM: 61_300, topSpeedMps: 25, groupRideId: null },
        { id: 'r2', title: null, startedAt: new Date('2026-10-22'), distanceM: 88_000, topSpeedMps: 30, groupRideId: 'g1' },
      ],
      photos: [{ rideId: 'r2', thumbPath: 'a-thumb' }, { rideId: 'r2', thumbPath: 'b-thumb' }, { rideId: 'r1', thumbPath: 'c-thumb' }],
    });
    const { items } = await svc.listAlbums('u1');
    expect(items.map((i) => i.rideId)).toEqual(['r2', 'r1']);
    expect(items[0]).toMatchObject({ photoCount: 3, group: true, coverUrl: 'https://cdn/a-thumb', distanceM: 88_000 });
    expect(items[1]).toMatchObject({ photoCount: 1, group: false, title: 'Dawn run' });
    expect(prisma.ridePhoto.groupBy.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  test('skips albums whose ride was deleted, and returns nothing when there are no photos', async () => {
    const gone = build({ groups: [{ rideId: 'r9', _count: { _all: 2 }, _max: { takenAt: new Date() } }], rides: [], photos: [] });
    expect((await gone.svc.listAlbums('u1')).items).toEqual([]);
    const none = build({ groups: [], rides: [], photos: [] });
    expect(await none.svc.listAlbums('u1')).toEqual({ items: [] });
    expect(none.prisma.ride.findMany).not.toHaveBeenCalled();
  });

  test('caps the page size', async () => {
    const { svc, prisma } = build({ groups: [], rides: [], photos: [] });
    await svc.listAlbums('u1', { limit: 5000 });
    expect(prisma.ridePhoto.groupBy.mock.calls[0][0].take).toBe(100);
  });
});
