const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;

const isHttpUrl = (value?: string | null) => {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
};

export const getFirebaseDownloadUrl = (path?: string | null): string | undefined => {
  if (!path) {
    return undefined;
  }

  if (isHttpUrl(path)) {
    return path;
  }

  if (!STORAGE_BUCKET) {
    return path;
  }

  const normalizedPath = path.replace(/^\//, '');
  const encodedPath = encodeURIComponent(normalizedPath);
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media`;
};

export const ensureDownloadUrl = (value?: string | null): string | undefined => {
  return getFirebaseDownloadUrl(value) ?? value ?? undefined;
};
