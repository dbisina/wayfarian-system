# Google OAuth Setup Guide

## The Problem
You're getting a 400 error when trying to use Google Sign-In because the Google Web Client ID is not properly configured.

## Solution Steps

### 1. Get Google Web Client ID from Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `wayfarian-e49b4`
3. Go to **Project Settings** (gear icon)
4. Scroll down to **Your apps** section
5. Find your web app or create one if it doesn't exist
6. Look for **Web API Key** and **OAuth 2.0 Client IDs**

### 2. Get OAuth 2.0 Client ID from Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `wayfarian-e49b4`
3. Go to **APIs & Services** > **Credentials**
4. Look for **OAuth 2.0 Client IDs**
5. Find the one for **Web application** (not Android/iOS)
6. Copy the **Client ID** (it looks like: `123456789-abcdefg.apps.googleusercontent.com`)

### 3. Add to Environment Variables

Add this line to your `.env` file in the app directory:

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="your-actual-client-id-here.apps.googleusercontent.com"
```

### 4. Configure OAuth Consent Screen

1. In Google Cloud Console, go to **APIs & Services** > **OAuth consent screen**
2. Make sure the consent screen is configured
3. Add your app domain and redirect URIs:
   - `https://auth.expo.io/@your-expo-username/wayfarian`
   - `wayfarian://auth`

### 5. Enable Google Sign-In in Firebase

1. Go to Firebase Console > **Authentication** > **Sign-in method**
2. Enable **Google** provider
3. Add your support email
4. Save the configuration

## Alternative: Use Firebase Auth Directly

If you continue having issues with Expo AuthSession, you can use Firebase Auth directly:

```typescript
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // Handle successful login
  } catch (error) {
    console.error('Google login error:', error);
  }
};
```

## Testing

After configuration:
1. Restart your Expo development server
2. Try Google Sign-In again
3. The 400 error should be resolved

## Current Status

- ✅ Firebase project configured: `wayfarian-e49b4`
- ✅ Firebase API key: `AIzaSyDWB96a0zDAzAm_4ZA9oaR8nI8pnoNLfZk`
- ❌ Google Web Client ID: Missing (needs to be added)
- ❌ OAuth redirect URIs: Need to be configured

## Quick Fix

If you want to test without Google OAuth for now, you can use email/password authentication or disable Google Sign-In in your app temporarily.

