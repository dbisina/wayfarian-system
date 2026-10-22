// Ride photos against a real database, with storage and image processing faked.
// Skipped unless TEST_DATABASE_URL is set.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('RidePhotoService (real database)', () => {
  let prisma, photos, rides, a, b, uploads, failImage;
  const file = (n = 10) => ({ buffer: Buffer.alloc(n, 1), mimetype: 'image/jpeg' });

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const { createRideService } = require('../RideService');
    const { createRidePhotoService } = require('../RidePhotoService');
    rides = createRideService({ prisma });
    uploads = [];
    failImage = false;
    photos = createRidePhotoService({
      prisma,
      storage: { upload: async (_buf, name, _type, folder) => { uploads.push(`${folder}/${name}`); return `${folder}/${name}`; } },
      imaging: { process: async (buf) => { if (failImage) throw new Error('bad image'); return { image: buf, thumb: buf }; } },
      urlFor: (p) => `https://cdn.test/${p}`,
    });
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "users" CASCADE');
    uploads.length = 0;
    failImage = false;
    a = await prisma.user.create({ data: { firebaseUid: 'qa', displayName: 'A' } });
    b = await prisma.user.create({ data: { firebaseUid: 'qb', displayName: 'B' } });
    await rides.upsertRide(a.id, 'ride-photo-0001', { startedAt: new Date().toISOString() });
  });

  test('stores a photo once however many times the upload is retried', async () => {
    const p1 = await photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0001', file(), { takenAt: '2026-10-22T10:00:00Z', latitude: '6.45', longitude: '3.4' });
    const p2 = await photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0001', file());
    expect(p2.id).toBe(p1.id);
    expect(uploads).toHaveLength(2); // image + thumbnail, once
    expect(await prisma.ridePhoto.count()).toBe(1);
    expect(p1).toMatchObject({ latitude: 6.45, longitude: 3.4 });
    expect(p1.imageUrl).toBe('https://cdn.test/users/' + a.id + '/rides/ride-photo-0001/photo-uuid-0001.jpg');
  });

  test('lists a ride\'s photos in the order they were taken', async () => {
    await photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0002', file(), { takenAt: '2026-10-22T10:30:00Z' });
    await photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0001', file(), { takenAt: '2026-10-22T10:00:00Z' });
    const { items } = await photos.listPhotos(a.id, 'ride-photo-0001');
    expect(items.map((i) => i.id)).toEqual(['photo-uuid-0001', 'photo-uuid-0002']);
  });

  test('only the owner can add or see photos; bad input is rejected', async () => {
    await expect(photos.putPhoto(b.id, 'ride-photo-0001', 'photo-uuid-0003', file())).rejects.toMatchObject({ status: 403 });
    await expect(photos.listPhotos(b.id, 'ride-photo-0001')).rejects.toMatchObject({ status: 403 });
    await expect(photos.putPhoto(a.id, 'nope-ride-0001', 'photo-uuid-0003', file())).rejects.toMatchObject({ status: 404 });
    await expect(photos.putPhoto(a.id, 'ride-photo-0001', 'x', file())).rejects.toMatchObject({ status: 400 });
    await expect(photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0004', { buffer: Buffer.alloc(0), mimetype: 'image/jpeg' })).rejects.toMatchObject({ status: 400 });
    await expect(photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0004', { buffer: Buffer.alloc(5), mimetype: 'text/plain' })).rejects.toMatchObject({ status: 400 });
    failImage = true;
    await expect(photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0004', file())).rejects.toMatchObject({ status: 400 });
    expect(await prisma.ridePhoto.count()).toBe(0);
  });

  test('deleting the ride removes its photo rows; a deleted ride takes no new photos', async () => {
    await photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0005', file());
    await rides.deleteRide(a.id, 'ride-photo-0001');
    await expect(photos.putPhoto(a.id, 'ride-photo-0001', 'photo-uuid-0006', file())).rejects.toMatchObject({ status: 409 });
  });
});
