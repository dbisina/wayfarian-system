// server/services/firebase.js

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (for server-side operations)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

// Firebase Admin services
const adminAuth = admin.auth();
const adminStorage = admin.storage();
const adminDb = admin.firestore();

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<object>} - Decoded token
 */
const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid Firebase token');
  }
};

/**
 * Create custom token for user
 * @param {string} uid - User UID
 * @returns {Promise<string>} - Custom token
 */
const createCustomToken = async (uid) => {
  try {
    const customToken = await adminAuth.createCustomToken(uid);
    return customToken;
  } catch (error) {
    throw new Error('Failed to create custom token');
  }
};

/**
 * Upload file to Firebase Storage
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} contentType - MIME type
 * @param {string} folder - Storage folder path
 * @returns {Promise<string>} - Download URL
 */
const uploadToStorage = async (fileBuffer, fileName, contentType, folder = 'uploads') => {
  try {
    const bucket = adminStorage.bucket();
    const file = bucket.file(`${folder}/${fileName}`);
    
    await file.save(fileBuffer, {
      metadata: {
        contentType: contentType,
      },
    });

    // Make file publicly accessible
    await file.makePublic();
    
    return `https://storage.googleapis.com/${bucket.name}/${folder}/${fileName}`;
  } catch (error) {
    throw new Error('Failed to upload file to storage');
  }
};

/**
 * Delete file from Firebase Storage
 * @param {string} filePath - Path to file in storage
 * @returns {Promise<void>}
 */
const deleteFromStorage = async (filePath) => {
  try {
    const bucket = adminStorage.bucket();
    await bucket.file(filePath).delete();
  } catch (error) {
    console.error('Failed to delete file from storage:', error);
  }
};

module.exports = {
  admin,
  adminAuth,
  adminStorage,
  adminDb,
  verifyIdToken,
  createCustomToken,
  uploadToStorage,
  deleteFromStorage,
};