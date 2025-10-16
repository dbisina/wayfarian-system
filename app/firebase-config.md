# Firebase Configuration Setup

## Environment Variables Required

Create a `.env` file in the app directory with the following variables:

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id

# Google Sign-In Configuration
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id

# Backend API
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SOCKET_URL=http://localhost:3001
```

## Getting Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing project
3. Go to Project Settings > General
4. Scroll down to "Your apps" section
5. Add a new web app
6. Copy the configuration values to your `.env` file

## Google Sign-In Setup (Expo Compatible)

### 1. Enable Google Sign-In in Firebase
1. Go to Firebase Console > Authentication > Sign-in method
2. Enable "Google" provider
3. Add your project's support email
4. Save the configuration

### 2. Get Google Web Client ID
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to APIs & Services > Credentials
4. Find your OAuth 2.0 Client ID for web application
5. Copy the Client ID to your `.env` file as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

### 3. Configure OAuth Consent Screen
1. In Google Cloud Console, go to APIs & Services > OAuth consent screen
2. Configure the consent screen with your app details
3. Add test users if in testing mode

### 4. Configure Redirect URI
1. In Google Cloud Console, go to APIs & Services > Credentials
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://auth.expo.io/@your-expo-username/your-app-slug`
   - `wayfarian://auth` (for development)

## Apple Sign-In Setup

### 1. Enable Apple Sign-In in Firebase
1. Go to Firebase Console > Authentication > Sign-in method
2. Enable "Apple" provider
3. Add your Apple Developer Team ID
4. Add your Apple Services ID
5. Save the configuration

### 2. Configure Apple Developer Account
1. Go to [Apple Developer Console](https://developer.apple.com/)
2. Create an App ID with Sign In with Apple capability
3. Create a Services ID for your app
4. Configure the Services ID with your domain and redirect URLs

### 3. iOS Configuration
For iOS, you'll need to:
1. Add Sign In with Apple capability in Xcode
2. Configure the entitlements file
3. Test on a physical device (Apple Sign-In doesn't work in simulator)

## Platform-Specific Setup

### Android
1. Add your SHA-1 fingerprint to Firebase project settings
2. Download and add `google-services.json` to `android/app/`
3. Configure Google Sign-In in `android/app/build.gradle`

### iOS
1. Add your bundle ID to Firebase project settings
2. Download and add `GoogleService-Info.plist` to `ios/app/`
3. Configure URL schemes in `ios/app/Info.plist`

## Current Status

- ✅ Firebase configuration with fallback values
- ✅ Auth context properly set up with Expo-compatible Google and Apple sign-in
- ✅ Route components have default exports
- ✅ Google Sign-In implementation complete (Expo AuthSession)
- ✅ Apple Sign-In implementation complete (Expo Apple Authentication)
- ✅ Expo-compatible dependencies installed
- ⚠️ Need to add real Firebase credentials to `.env` file
- ⚠️ Need to configure Google and Apple providers in Firebase Console
- ⚠️ Need to set up OAuth redirect URIs in Google Cloud Console

## Testing

- **Google Sign-In**: Works on both Android and iOS via Expo AuthSession
- **Apple Sign-In**: Only works on iOS devices (not simulator)
- **Email/Password**: Works on all platforms
- **Error Handling**: Comprehensive error messages for all auth methods
- **Expo Go Compatible**: All authentication methods work in Expo Go

