// Firebase Admin SDK service (canonical file name: Firebase.js)
const admin = require('firebase-admin');
const { uploadToLocalStorage, deleteFromLocalStorage } = require('./LocalStorage');
const { uploadToCloudinary, deleteFromCloudinary, cloudinaryInitialized } = require('./CloudinaryService');

// Initialize Firebase Admin SDK (for server-side operations)
let firebaseInitialized = false;
let storageAvailable = false;
if (!admin.apps.length) {
  try {
    // Check if all required Firebase environment variables are present
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized');
      
      // Test storage availability
      if (process.env.FIREBASE_STORAGE_BUCKET) {
        try {
          const bucket = admin.storage().bucket();
          storageAvailable = true;
          console.log('Firebase Storage configured:', bucket.name);
        } catch (error) {
          console.warn('Firebase Storage bucket not accessible:', error.message);
          console.warn('Will use local file storage as fallback');
        }
      }
    } else {
      console.warn('Firebase credentials not found. Firebase features will be disabled.');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error.message);
    console.warn('Firebase features will be disabled.');
  }
}

// Firebase Admin services (only if initialized)
const adminAuth = firebaseInitialized ? admin.auth() : null;
const adminStorage = firebaseInitialized ? admin.storage() : null;
const adminDb = firebaseInitialized ? admin.firestore() : null;

// Verify Firebase ID token
const verifyIdToken = async (idToken) => {
  if (!firebaseInitialized || !adminAuth) {
    throw new Error('Firebase is not initialized. Please configure Firebase credentials.');
  }
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    throw new Error('Invalid Firebase token');
  }
};

// Create custom token for user
const createCustomToken = async (uid) => {
  if (!firebaseInitialized || !adminAuth) {
    throw new Error('Firebase is not initialized. Please configure Firebase credentials.');
  }
  try {
    return await adminAuth.createCustomToken(uid);
  } catch (error) {
    throw new Error('Failed to create custom token');
  }
};

// Upload file to Storage (Cloudinary → Firebase → Local fallback)
const uploadToStorage = async (fileBuffer, fileName, contentType, folder = 'uploads') => {
  // Priority 1: Try Cloudinary (fastest, most reliable)
  if (cloudinaryInitialized) {
    try {
      console.log('[Storage] Using Cloudinary for upload');
      return await uploadToCloudinary(fileBuffer, fileName, folder);
    } catch (error) {
      console.error('[Storage] Cloudinary upload failed:', error.message);
      console.warn('[Storage] Falling back to Firebase/Local storage');
    }
  }
  
  // Priority 2: Try Firebase Storage
  if (firebaseInitialized && adminStorage && storageAvailable) {
    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(`${folder}/${fileName}`);
      
      console.log('[Storage] Using Firebase Storage for upload');
      await file.save(fileBuffer, { metadata: { contentType } });
      await file.makePublic();
      
      const url = `https://storage.googleapis.com/${bucket.name}/${folder}/${fileName}`;
      console.log('[Storage] Firebase upload complete:', url);
      return url;
    } catch (error) {
      console.error('[Storage] Firebase upload failed:', error.message);
      console.warn('[Storage] Falling back to local storage');
    }
  }
  
  // Priority 3: Fallback to local storage
  console.warn('[Storage] Using local storage fallback');
  return await uploadToLocalStorage(fileBuffer, fileName, contentType, folder);
};

// Delete file from Storage (tries Cloudinary → Firebase → Local)
const deleteFromStorage = async (filePath) => {
  // Try Cloudinary first (check if URL is from Cloudinary)
  if (cloudinaryInitialized && filePath.includes('cloudinary.com')) {
    try {
      await deleteFromCloudinary(filePath);
      return;
    } catch (error) {
      console.error('[Storage] Cloudinary delete failed:', error.message);
    }
  }
  
  // Try Firebase Storage
  if (firebaseInitialized && adminStorage && storageAvailable) {
    try {
      const bucket = adminStorage.bucket();
      await bucket.file(filePath).delete();
      return;
    } catch (error) {
      console.error('[Storage] Firebase delete failed:', error.message);
    }
  }
  
  // Fallback to local storage
  await deleteFromLocalStorage(filePath);
};

module.exports = {
  admin,
  adminAuth,
  adminStorage,
  adminDb,
  firebaseInitialized,
  storageAvailable,
  cloudinaryInitialized,
  verifyIdToken,
  createCustomToken,
  uploadToStorage,
  deleteFromStorage,
};