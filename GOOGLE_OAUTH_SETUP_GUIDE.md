# Google OAuth Setup Guide

## The Google 404 Error Fix

The Google 404 error occurs because the Google OAuth configuration is incomplete. We're using Expo's AuthSession for Google Sign-In, which is more reliable than native modules.

## 1. Create Google OAuth Credentials

### Go to Google Cloud Console:
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable the Google+ API and Google Sign-In API

### Create OAuth 2.0 Credentials:
1. Go to "Credentials" in the left sidebar
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Create credentials for:
   - **Web application** (for Expo AuthSession - this is the main one you need)

## 2. Configure OAuth Credentials

### For Web Application (Main Configuration):
- **Name**: Wayfarian Web Client
- **Authorized JavaScript origins**: 
  - `http://localhost:8081` (for Expo development)
  - `https://your-domain.com` (for production)
- **Authorized redirect URIs**:
  - `http://localhost:8081` (for Expo development)
  - `https://auth.expo.io/@your-expo-username/your-app-slug` (for Expo AuthSession)

## 3. Update Your Environment Variables

Create a `.env` file in your app directory with:

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyDWB96a0zDAzAm_4ZA9oaR8nI8pnoNLfZk
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=wayfarian-e49b4.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=wayfarian-e49b4
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=wayfarian-e49b4.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=65260446195
EXPO_PUBLIC_FIREBASE_APP_ID=1:65260446195:web:c11a2c5454f3bb65a83286

# Google OAuth Configuration (REPLACE WITH YOUR ACTUAL VALUES)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID_HERE.apps.googleusercontent.com

# Backend API
EXPO_PUBLIC_API_URL=http://localhost:3001/api
```

## 4. No app.json Configuration Needed

Since we're using Expo's AuthSession, no additional configuration is needed in `app.json`. The Google Sign-In will work through the web OAuth flow.

## 5. Configure Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to "Authentication" → "Sign-in method"
4. Enable "Google" sign-in provider
5. Add your Web client ID (the one you created in step 1)

## 6. Test the Configuration

After making these changes:

```bash
# Clear Expo cache and restart
expo start --clear
```

The Google Sign-In should now work without the 404 error!

## 7. Current Status

✅ **Fixed Issues:**
- Removed native Google Sign-In library that was causing 404 errors
- Installed proper Expo dependencies (`expo-auth-session`, `expo-web-browser`)
- Fixed TypeScript dependencies
- Updated AuthContext to use Expo AuthSession
- Cleaned and reinstalled all dependencies

✅ **Ready to Test:**
- App should now start without dependency errors
- Google Sign-In will use Expo's AuthSession (more reliable)
- Only need to add your Google OAuth Web Client ID to environment variables

## 8. Verify the Setup

1. Try Google Sign-In on your app
2. Check the console for any remaining errors
3. Verify that the OAuth flow completes successfully

## Common Issues and Solutions

### Issue: "Invalid client" error
**Solution**: Make sure your client IDs match exactly between Google Console, Firebase, and your app configuration.

### Issue: "Redirect URI mismatch" error  
**Solution**: Ensure the redirect URIs in Google Console match your app's configuration.

### Issue: "Package name mismatch" error (Android)
**Solution**: Verify the package name in Google Console matches `com.wayfarian.app`.

### Issue: "Bundle ID mismatch" error (iOS)
**Solution**: Verify the bundle identifier in Google Console matches `com.wayfarian.app`.

## Quick Test

To quickly test if your configuration is working, you can temporarily use the Firebase test credentials, but for production, you must use your own OAuth credentials.

---

**Note**: The 404 error specifically indicates that the OAuth client ID is not found or not properly configured. Following these steps should resolve the issue.
