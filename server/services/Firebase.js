// server/services/firebase.js

const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');
const { getStorage } = require('firebase/storage');

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

// Firebase Client Configuration (for client-side operations)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase Client SDK
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);

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
  auth,
  storage,
  verifyIdToken,
  createCustomToken,
  uploadToStorage,
  deleteFromStorage,
};

// Client-side Firebase configuration (for React Native)
// client/services/firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Storage
const storage = getStorage(app);

export { auth, storage };
export default app;