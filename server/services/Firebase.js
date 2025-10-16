// server/services/firebase.js

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (for server-side operations)
let firebaseInitialized = false;
if (!admin.apps.length) {
  try {
    // Check if all required Firebase environment variables are present
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } else {
      console.warn('⚠️  Firebase credentials not found. Firebase features will be disabled.');
      console.warn('   To enable Firebase, set the following environment variables:');
      console.warn('   - FIREBASE_PROJECT_ID');
      console.warn('   - FIREBASE_CLIENT_EMAIL');
      console.warn('   - FIREBASE_PRIVATE_KEY');
      console.warn('   - FIREBASE_STORAGE_BUCKET (optional)');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
    console.warn('   Firebase features will be disabled.');
  }
}

// Firebase Admin services (only if initialized)
const adminAuth = firebaseInitialized ? admin.auth() : null;
const adminStorage = firebaseInitialized ? admin.storage() : null;
const adminDb = firebaseInitialized ? admin.firestore() : null;

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<object>} - Decoded token
 */
const verifyIdToken = async (idToken) => {
  if (!firebaseInitialized || !adminAuth) {
    throw new Error('Firebase is not initialized. Please configure Firebase credentials.');
  }
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
  if (!firebaseInitialized || !adminAuth) {
    throw new Error('Firebase is not initialized. Please configure Firebase credentials.');
  }
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
  if (!firebaseInitialized || !adminStorage) {
    throw new Error('Firebase is not initialized. Please configure Firebase credentials.');
  }
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
  if (!firebaseInitialized || !adminStorage) {
    console.warn('Firebase is not initialized. Cannot delete file from storage.');
    return;
  }
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
  firebaseInitialized,
  verifyIdToken,
  createCustomToken,
  uploadToStorage,
  deleteFromStorage,
};