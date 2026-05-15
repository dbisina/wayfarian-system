const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;

const isHttpUrl = (value?: string | null) => {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
};

/**
 * Converts a Firebase Storage path or partial URL into a full authenticated download URL.
 *
 * Handles three cases:
 * - Falsy input → `undefined`
 * - Already a full HTTP(S) URL → returned as-is (avoids double-encoding)
 * - Storage path → assembled into the `firebasestorage.googleapis.com` download URL
 *   using `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`. Falls back to the raw path if the
 *   bucket env var is unset (e.g. in unit tests).
 *
 * @param path - A Firebase Storage object path or an existing download URL.
 * @returns A fully-qualified download URL, or `undefined` if `path` is falsy.
 */
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

/**
 * Convenience wrapper around `getFirebaseDownloadUrl` that falls back to the
 * raw input value rather than `undefined` when URL construction is not possible.
 * Useful where a string is always expected but the value may be a raw path.
 *
 * @param value - A Firebase Storage path, download URL, or null/undefined.
 * @returns A string URL, or `undefined` if input is falsy.
 */
export const ensureDownloadUrl = (value?: string | null): string | undefined => {
  return getFirebaseDownloadUrl(value) ?? value ?? undefined;
};
