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

// A photo from the older journeys: path is firebasePath, speed in km/h, distance in km.
const v1 = (id, takenAt, extra = {}) => ({
  id,
  journeyId: 'j1',
  takenAt: new Date(takenAt),
  latitude: 6.6,
  longitude: 3.3,
  firebasePath: `${id}-full`,
  thumbnailPath: `${id}-thumb`,
  captureSpeed: 72,
  captureDistance: 12.5,
  journey: { title: 'Auto title', customTitle: 'Lagos to Ibadan', startTime: new Date(takenAt), totalDistance: 128, totalTime: 7500 },
  ...extra,
});

function build({ rows = [], dates = rows.map((r) => ({ takenAt: r.takenAt })), legacy = [], legacyDates = legacy.map((r) => ({ takenAt: r.takenAt })) } = {}) {
  const ridePhoto = { findMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(dates) };
  const photoTable = { findMany: jest.fn().mockResolvedValueOnce(legacy).mockResolvedValueOnce(legacyDates) };
  const prisma = { ridePhoto, photo: photoTable };
  return { prisma, svc: createRidePhotoService({ prisma, storage: {}, imaging: {}, urlFor: (p) => `https://cdn/${p}` }) };
}

describe('listMapPhotos', () => {
  test('returns positioned photos with their ride and the years that have photos', async () => {
    const { svc } = build({ rows: [photo('a', '2026-10-18'), photo('b', '2025-03-02')] });
    const out = await svc.listMapPhotos('u1');
    expect(out.years).toEqual([2026, 2025]);
    expect(out.items[0]).toMatchObject({
      id: 'a',
      thumbnailUrl: 'https://cdn/a-thumb',
      imageUrl: 'https://cdn/a-full',
      latitude: 6.5,
      journeyId: null,
      ride: { title: 'Obudu', distanceM: 142_000, elapsedTimeS: 11_280 },
    });
  });

  test('only asks for the rider’s own, positioned photos on rides that still exist', async () => {
    const { svc, prisma } = build();
    await svc.listMapPhotos('u1');
    expect(prisma.ridePhoto.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      latitude: { not: null },
      longitude: { not: null },
      ride: { status: { not: 'DELETED' } },
    });
  });

  test('narrows to one year but keeps listing every year', async () => {
    const { svc, prisma } = build();
    await svc.listMapPhotos('u1', { year: '2026' });
    const [rows, years] = prisma.ridePhoto.findMany.mock.calls.map((c) => c[0].where);
    expect(rows.takenAt).toEqual({ gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z') });
    expect(years.takenAt).toBeUndefined();
  });

  test('caps the page size and ignores a junk year', async () => {
    const { svc, prisma } = build();
    await svc.listMapPhotos('u1', { year: 'abc', limit: 99999 });
    expect(prisma.ridePhoto.findMany.mock.calls[0][0].take).toBe(500);
    expect(prisma.ridePhoto.findMany.mock.calls[0][0].where.takenAt).toBeUndefined();
  });
});

describe('listMapPhotos with photos from the older journeys', () => {
  test('v1 photos are included, in the same shape, with their journey’s title and stats', async () => {
    const { svc } = build({ legacy: [v1('p1', '2025-06-01')] });
    const { items } = await svc.listMapPhotos('u1');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'v1-p1', // cannot clash with a v2 photo id
      rideId: null,
      journeyId: 'j1',
      latitude: 6.6,
      imageUrl: 'https://cdn/p1-full',
      thumbnailUrl: 'https://cdn/p1-thumb',
      ride: { title: 'Lagos to Ibadan', distanceM: 128_000, elapsedTimeS: 7500 },
    });
    expect(items[0].speedMps).toBeCloseTo(20, 5); // 72 km/h
    expect(items[0].rideDistanceM).toBe(12_500);
  });

  test('v1 and v2 photos are mixed newest first, and their years are combined', async () => {
    const { svc } = build({
      rows: [photo('new', '2026-10-18'), photo('old2', '2024-01-01')],
      legacy: [v1('mid', '2025-06-01')],
    });
    const out = await svc.listMapPhotos('u1');
    expect(out.items.map((i) => i.id)).toEqual(['new', 'v1-mid', 'old2']);
    expect(out.years).toEqual([2026, 2025, 2024]);
  });

  test('a v1 photo with no thumbnail falls back to the full image, and one whose journey was deleted has no album', async () => {
    const { svc } = build({ legacy: [v1('p2', '2025-06-01', { thumbnailPath: null, journeyId: null, journey: null })] });
    const [item] = (await svc.listMapPhotos('u1')).items;
    expect(item.thumbnailUrl).toBe('https://cdn/p2-full');
    expect(item.journeyId).toBeNull();
    expect(item.ride.title).toBeNull();
  });

  test('hidden journeys and photos with no position are left out of the query', async () => {
    const { svc, prisma } = build();
    await svc.listMapPhotos('u1', { year: '2025' });
    const where = prisma.photo.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', latitude: { not: null }, longitude: { not: null } });
    expect(where.OR).toEqual([{ journeyId: null }, { journey: { isHidden: false } }]);
    expect(where.takenAt).toBeDefined();
  });

  test('the page size applies to the mix', async () => {
    const rows = [photo('a', '2026-03-01'), photo('b', '2026-02-01')];
    const legacy = [v1('c', '2026-04-01')];
    const { svc } = build({ rows, legacy });
    const out = await svc.listMapPhotos('u1', { limit: 2 });
    expect(out.items.map((i) => i.id)).toEqual(['v1-c', 'a']);
  });
});
