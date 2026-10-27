const { createRidePhotoService } = require('../RidePhotoService');

const photo = (id, takenAt, extra = {}) => ({
  id,
  rideId: 'r1',
  takenAt: new Date(takenAt),
  latitude: 6.5,
  longitude: 3.4,
  path: `${id}-full`,
  thumbPath: `${id}-thumb`,
  ride: { title: 'Obudu', startedAt: new Date(takenAt), distanceM: 142_000, elapsedTimeS: 11_280 },
  ...extra,
});

function build(rows, dates = rows.map((r) => ({ takenAt: r.takenAt }))) {
  const findMany = jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(dates);
  const prisma = { ridePhoto: { findMany } };
  return { prisma, svc: createRidePhotoService({ prisma, storage: {}, imaging: {}, urlFor: (p) => `https://cdn/${p}` }) };
}

describe('listMapPhotos', () => {
  test('returns positioned photos with their ride and the years that have photos', async () => {
    const { svc } = build([photo('a', '2026-10-18'), photo('b', '2025-03-02')]);
    const out = await svc.listMapPhotos('u1');
    expect(out.years).toEqual([2026, 2025]);
    expect(out.items[0]).toMatchObject({
      id: 'a',
      thumbnailUrl: 'https://cdn/a-thumb',
      imageUrl: 'https://cdn/a-full',
      latitude: 6.5,
      ride: { title: 'Obudu', distanceM: 142_000, elapsedTimeS: 11_280 },
    });
  });

  test('only asks for the rider’s own, positioned photos on rides that still exist', async () => {
    const { svc, prisma } = build([]);
    await svc.listMapPhotos('u1');
    expect(prisma.ridePhoto.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      latitude: { not: null },
      longitude: { not: null },
      ride: { status: { not: 'DELETED' } },
    });
  });

  test('narrows to one year but keeps listing every year', async () => {
    const { svc, prisma } = build([]);
    await svc.listMapPhotos('u1', { year: '2026' });
    const [rows, years] = prisma.ridePhoto.findMany.mock.calls.map((c) => c[0].where);
    expect(rows.takenAt).toEqual({ gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z') });
    expect(years.takenAt).toBeUndefined();
  });

  test('caps the page size and ignores a junk year', async () => {
    const { svc, prisma } = build([]);
    await svc.listMapPhotos('u1', { year: 'abc', limit: 99999 });
    expect(prisma.ridePhoto.findMany.mock.calls[0][0].take).toBe(500);
    expect(prisma.ridePhoto.findMany.mock.calls[0][0].where.takenAt).toBeUndefined();
  });
});
