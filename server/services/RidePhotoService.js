// server/services/RidePhotoService.js
//
// Photos taken during a v2 ride. The device generates the photo id, so the upload can be retried
// from the offline queue any number of times and still produce exactly one photo.

const defaultPrisma = require('../prisma/client');
const { RideError } = require('./RideService');

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_PHOTOS_PER_RIDE = 100;

function createRidePhotoService({ prisma = defaultPrisma, storage, imaging, urlFor = (p) => p } = {}) {
  if (!storage || !imaging) throw new Error('RidePhotoService needs storage and imaging');

  async function ownedRide(userId, rideId) {
    const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { id: true, userId: true, status: true } });
    if (!ride) throw new RideError('not_found', 404, 'Ride not found');
    if (ride.userId !== userId) throw new RideError('forbidden', 403, 'Not your ride');
    if (ride.status === 'DELETED') throw new RideError('conflict', 409, 'Ride was deleted');
    return ride;
  }

  const view = (p) => ({
    id: p.id,
    rideId: p.rideId,
    takenAt: p.takenAt,
    latitude: p.latitude,
    longitude: p.longitude,
    imageUrl: urlFor(p.path),
    thumbnailUrl: urlFor(p.thumbPath),
  });

  /**
   * Stores one photo. Re-sending the same id returns the stored photo without uploading again.
   * `file` is { buffer, mimetype }.
   */
  async function putPhoto(userId, rideId, photoId, file, meta = {}) {
    if (typeof photoId !== 'string' || !ID_PATTERN.test(photoId)) throw new RideError('invalid_input', 400, 'photoId must be 8-64 chars of letters, digits, _ or -');
    await ownedRide(userId, rideId);

    const existing = await prisma.ridePhoto.findUnique({ where: { id: photoId } });
    if (existing) {
      if (existing.userId !== userId || existing.rideId !== rideId) throw new RideError('forbidden', 403, 'Not your photo');
      return view(existing);
    }
    if (!file || !file.buffer || !file.buffer.length) throw new RideError('invalid_input', 400, 'an image file is required');
    if (!/^image\//.test(file.mimetype || '')) throw new RideError('invalid_input', 400, 'only image files are allowed');
    const count = await prisma.ridePhoto.count({ where: { rideId } });
    if (count >= MAX_PHOTOS_PER_RIDE) throw new RideError('conflict', 409, `at most ${MAX_PHOTOS_PER_RIDE} photos per ride`);

    const takenAt = meta.takenAt ? new Date(meta.takenAt) : new Date();
    if (Number.isNaN(takenAt.getTime())) throw new RideError('invalid_input', 400, 'takenAt must be a valid date');
    const lat = meta.latitude == null || meta.latitude === '' ? null : Number(meta.latitude);
    const lng = meta.longitude == null || meta.longitude === '' ? null : Number(meta.longitude);
    const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

    let processed;
    try {
      processed = await imaging.process(file.buffer); // { image: Buffer, thumb: Buffer }
    } catch {
      throw new RideError('invalid_input', 400, 'that file is not a readable image');
    }

    const folder = `users/${userId}/rides/${rideId}`;
    const name = `${photoId}.jpg`;
    const thumbName = `thumb_${photoId}.jpg`;
    const [imageRef, thumbRef] = await Promise.all([
      storage.upload(processed.image, name, 'image/jpeg', folder),
      storage.upload(processed.thumb, thumbName, 'image/jpeg', `${folder}/thumbnails`),
    ]);
    // Cloudinary returns a full URL; Firebase/local return a URL we can rebuild from the path.
    const path = /^https?:\/\//.test(imageRef) ? imageRef : `${folder}/${name}`;
    const thumbPath = /^https?:\/\//.test(thumbRef) ? thumbRef : `${folder}/thumbnails/${thumbName}`;

    try {
      const row = await prisma.ridePhoto.create({
        data: { id: photoId, rideId, userId, path, thumbPath, takenAt, latitude: hasPos ? lat : null, longitude: hasPos ? lng : null },
      });
      return view(row);
    } catch (err) {
      if (err && err.code === 'P2002') return view(await prisma.ridePhoto.findUnique({ where: { id: photoId } }));
      throw err;
    }
  }

  async function listPhotos(userId, rideId) {
    await ownedRide(userId, rideId);
    const rows = await prisma.ridePhoto.findMany({ where: { rideId }, orderBy: [{ takenAt: 'asc' }, { id: 'asc' }] });
    return { items: rows.map(view) };
  }

  return { putPhoto, listPhotos };
}

/** The real dependencies: sharp for resizing, the existing storage helper for uploads. */
function defaultDeps() {
  const sharp = require('sharp');
  const { uploadToStorage } = require('./Firebase');
  const { buildStorageUrl } = require('../utils/photoFormatter');
  return {
    storage: { upload: uploadToStorage },
    imaging: {
      async process(buffer) {
        const pipeline = sharp(buffer).rotate();
        const [image, thumb] = await Promise.all([
          pipeline.clone().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, progressive: true }).toBuffer(),
          pipeline.clone().resize(420, 420, { fit: 'cover' }).jpeg({ quality: 60, progressive: true }).toBuffer(),
        ]);
        return { image, thumb };
      },
    },
    urlFor: buildStorageUrl,
  };
}

module.exports = { createRidePhotoService, defaultDeps, MAX_PHOTOS_PER_RIDE };
