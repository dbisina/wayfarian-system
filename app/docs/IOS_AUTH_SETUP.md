# iOS Authentication Setup Guide

This guide explains how to set up Google and Apple Sign-In for iOS in the Wayfarian app.

## Google Sign-In for iOS

### Prerequisites
1. **Firebase Project**: Set up a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. **iOS App in Firebase**: Add an iOS app to your Firebase project
3. **GoogleService-Info.plist**: Download and add to your app root
4. **Google OAuth Client IDs**: Configure in Google Cloud Console

### Configuration Steps

#### 1. Environment Variables
Add these to your `.env` file:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_client_id_here
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id_here
```

#### 2. Get iOS Client ID
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Create an **OAuth 2.0 Client ID** for iOS
4. Use your iOS bundle ID: `com.wayfarian.wayfarianadventures`
5. Copy the iOS Client ID

#### 3. Configure URL Scheme in app.json
The URL scheme should match your iOS Client ID reverse format:
```json
"ios": {
  "infoPlist": {
    "CFBundleURLTypes": [
      {
        "CFBundleURLSchemes": [
          "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID"
        ]
      }
    ]
  }
}
```

#### 4. Configure Firebase
1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Google** sign-in provider
3. Add your iOS bundle ID
4. Add the SHA-1 certificate fingerprint (for Android)

## Apple Sign-In for iOS

### Prerequisites
1. **Apple Developer Account**: Required for production
2. **App ID with Sign In with Apple**: Configure in Apple Developer Portal
3. **Service ID**: Create in Apple Developer Portal
4. **Private Key**: Generate for authentication

### Configuration Steps

#### 1. Apple Developer Portal Setup
1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Navigate to **Certificates, Identifiers & Profiles**
3. **Identifiers** → **App IDs**
4. Select your app and enable **Sign In with Apple**

#### 2. Create Service ID
1. In **Identifiers** → **Service IDs**
2. Click **+** to create new Service ID
3. Enable **Sign In with Apple**
4. Configure domains (for web flow if needed)

#### 3. Configure app.json
Ensure Apple Sign-In is enabled in plugins:
```json
"plugins": [
  "expo-apple-authentication"
]
```

#### 4. Firebase Configuration
1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Apple** sign-in provider
3. Enter your Service ID and Team ID
4. Upload the private key

## Common Issues and Solutions

### Google Sign-In Crashes on iOS
1. **Missing iOS Client ID**: Ensure `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set
2. **Incorrect URL Scheme**: Verify CFBundleURLSchemes matches your iOS Client ID
3. **Firebase Configuration**: Ensure iOS app is properly configured in Firebase
4. **GoogleService-Info.plist**: Verify it's in the correct location

### Apple Sign-In "Credential malformed or expired"
1. **Nonce Mismatch**: Ensure raw nonce is passed to Firebase, hashed nonce to Apple
2. **Token Expiry**: Apple identity tokens expire quickly, ensure immediate processing
3. **Service ID Mismatch**: Verify Service ID matches Firebase configuration
4. **Private Key Issues**: Regenerate private key if expired

### Testing
1. **Development**: Use Expo Go for testing
2. **Production**: Create development build with `eas build`
3. **Simulator**: Some features may not work in simulator
4. **Real Device**: Always test on real iOS device

## Troubleshooting

### Check Configuration
```bash
# Check environment variables
echo $EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

# Check app.json configuration
cat app.json | grep -A5 -B5 "CFBundleURLSchemes"

# Check Firebase configuration
cat GoogleService-Info.plist | grep -i "bundle"
```

### Debug Logs
Add debug logging to AuthContext:
```typescript
console.log('Google iOS Client ID:', GOOGLE_IOS_CLIENT_ID);
console.log('Platform:', Platform.OS);
console.log('App Ownership:', Constants.appOwnership);
```

### Firebase Debug
Enable Firebase debug mode:
```typescript
import { initializeApp } from 'firebase/app';

const app = initializeApp(firebaseConfig);
if (__DEV__) {
  // Enable debug logging
  require('firebase/auth').setLogLevel('debug');
}
```

## Additional Resources
- [Firebase iOS Setup](https://firebase.google.com/docs/ios/setup)
- [Expo Google Sign-In](https://docs.expo.dev/versions/latest/sdk/google-sign-in/)
- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [React Native Firebase Auth](https://rnfirebase.io/auth/usage)