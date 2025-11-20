const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;

const isHttp = value => typeof value === 'string' && /^https?:\/\//i.test(value);

const buildStorageUrl = (value) => {
  if (!value) return undefined;
  if (isHttp(value)) return value;
  if (!STORAGE_BUCKET) return value;
  const normalized = value.replace(/^\/+/, '');
  const encoded = encodeURIComponent(normalized);
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encoded}?alt=media`;
};

const hydratePhoto = (photo) => {
  if (!photo) return null;
  return {
    ...photo,
    imageUrl: buildStorageUrl(photo.imageUrl || photo.firebasePath),
    thumbnailUrl: buildStorageUrl(photo.thumbnailUrl || photo.thumbnailPath),
  };
};

const hydratePhotos = (photos = []) => photos.map(hydratePhoto).filter(Boolean);

const getCoverPhotoUrl = (photos = []) => {
  if (!photos.length) return undefined;
  const first = photos[0];
  return buildStorageUrl(first.imageUrl || first.firebasePath || first.thumbnailPath);
};

module.exports = {
  buildStorageUrl,
  hydratePhoto,
  hydratePhotos,
  getCoverPhotoUrl,
};
