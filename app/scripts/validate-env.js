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

const missing = requiredKeys.filter((key) => {
  const value = process.env[key];
  return typeof value !== 'string' || value.trim().length === 0 || value.includes('REPLACE_ME');
});

if (missing.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  missing.forEach((key) => console.error(`  - ${key}`));
  console.error('\nPlease update your .env file (or CI environment) before continuing.');
  process.exit(1);
}

// Additional sanity check for API keys accidentally hardcoded in config files
if (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.startsWith('AIzaSyC6su5LGyJVGf8bxKR4q')) {
  console.warn('\n⚠️ The Google Maps API key appears to be the legacy hard-coded value.');
  console.warn('   Replace it with a project-specific key stored in your environment configuration.');
}
