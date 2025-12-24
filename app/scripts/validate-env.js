#!/usr/bin/env node
/* eslint-disable */
/*
 * Basic environment variable validation executed before Expo commands.
 * Ensures required credentials are present to avoid runtime failures.
 */

const requiredKeys = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
];

// Platform-specific required keys
const platformSpecificKeys = {
  ios: [
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  ],
  android: [
    'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  ],
};

// Get current platform from command line arguments or default to checking all
const platform = process.argv[2] || 'all';

const missing = requiredKeys.filter((key) => {
  const value = process.env[key];
  return typeof value !== 'string' || value.trim().length === 0 || value.includes('REPLACE_ME');
});

// Add platform-specific missing keys
if (platform === 'ios' || platform === 'all') {
  platformSpecificKeys.ios.forEach((key) => {
    const value = process.env[key];
    if (typeof value !== 'string' || value.trim().length === 0 || value.includes('REPLACE_ME')) {
      missing.push(key);
    }
  });
}

if (platform === 'android' || platform === 'all') {
  platformSpecificKeys.android.forEach((key) => {
    const value = process.env[key];
    if (typeof value !== 'string' || value.trim().length === 0 || value.includes('REPLACE_ME')) {
      missing.push(key);
    }
  });
}

if (missing.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  missing.forEach((key) => console.error(`  - ${key}`));
  console.error('\nPlease update your .env file (or CI environment) before continuing.');

  // Provide helpful hints for iOS setup
  if (missing.includes('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID')) {
    console.error('\n💡 For iOS Google Sign-In setup:');
    console.error('   1. Go to Google Cloud Console → APIs & Services → Credentials');
    console.error('   2. Create OAuth 2.0 Client ID for iOS');
    console.error('   3. Use bundle ID: com.wayfarian.wayfarianadventures');
    console.error('   4. Add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID to your .env file');
  }

  process.exit(1);
}

// Additional sanity check for API keys accidentally hardcoded in config files
if (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.startsWith('AIzaSyC6su5LGyJVGf8bxKR4q')) {
  console.warn('\n⚠️ The Google Maps API key appears to be the legacy hard-coded value.');
  console.warn('   Replace it with a project-specific key stored in your environment configuration.');
}

console.log('✅ Environment variables validated successfully');

