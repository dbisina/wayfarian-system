# Firebase OAuth Integration Guide

## Current Implementation vs Firebase Integration

### 🔍 **Current Setup (Expo AuthSession)**
Your app currently uses:
- `expo-auth-session` for Google/Apple OAuth
- Manual token exchange with Firebase
- Custom OAuth flow handling

### 🚀 **Firebase Integration (Recommended)**
Firebase provides built-in OAuth providers that are:
- More secure
- Easier to maintain
- Better error handling
- Automatic token management

## Firebase OAuth Setup

### 1. Enable OAuth Providers in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `wayfarian-e49b4`
3. Go to **Authentication** > **Sign-in method**
4. Enable **Google** and **Apple** providers
5. Configure the providers with your app details

### 2. Google Sign-In Configuration

**For Web:**
```typescript
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    const result = await signInWithPopup(auth, provider);
    // User is automatically signed in to Firebase
    await syncUserData(result.user);
  } catch (error) {
    console.error('Google login error:', error);
  }
};
```

**For Mobile (React Native):**
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: 'your-web-client-id.apps.googleusercontent.com',
});

const loginWithGoogle = async () => {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const googleCredential = GoogleAuthProvider.credential(userInfo.idToken);
    const result = await signInWithCredential(auth, googleCredential);
    await syncUserData(result.user);
  } catch (error) {
    console.error('Google login error:', error);
  }
};
```

### 3. Apple Sign-In Configuration

```typescript
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';

const loginWithApple = async () => {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const { identityToken, authorizationCode } = credential;
    
    if (identityToken) {
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({
        idToken: identityToken,
        rawNonce: authorizationCode,
      });
      
      const result = await signInWithCredential(auth, credential);
      await syncUserData(result.user);
    }
  } catch (error) {
    console.error('Apple login error:', error);
  }
};
```

## Required Dependencies

### For React Native (Mobile):
```bash
npm install @react-native-google-signin/google-signin
npm install expo-apple-authentication
```

### For Web:
No additional dependencies needed - Firebase handles everything.

## Configuration Steps

### 1. Google Cloud Console Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `wayfarian-e49b4`
3. Go to **APIs & Services** > **Credentials**
4. Create OAuth 2.0 Client IDs for:
   - **Web application** (for web)
   - **iOS** (for iOS app)
   - **Android** (for Android app)

### 2. Firebase Console Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `wayfarian-e49b4`
3. Go to **Authentication** > **Sign-in method**
4. Enable **Google** provider
5. Add your OAuth client IDs
6. Enable **Apple** provider (iOS only)

### 3. Environment Variables
Add to your `.env` file:
```env
# Google OAuth (for mobile)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="your-web-client-id.apps.googleusercontent.com"

# Apple Sign-In (iOS only)
EXPO_PUBLIC_APPLE_SERVICE_ID="your-apple-service-id"
```

## Benefits of Firebase Integration

### ✅ **Advantages:**
- **Automatic token management** - Firebase handles refresh tokens
- **Better security** - Firebase manages OAuth flow securely
- **Consistent API** - Same interface for all platforms
- **Built-in error handling** - Firebase provides detailed error messages
- **Automatic user creation** - Users are created in Firebase Auth automatically

### ❌ **Current Expo AuthSession Issues:**
- Manual token management
- Complex OAuth flow handling
- Platform-specific implementations
- More error-prone

## Migration Strategy

### Option 1: Keep Current Implementation
- Add proper Google Web Client ID
- Fix OAuth redirect URIs
- Continue with Expo AuthSession

### Option 2: Migrate to Firebase OAuth (Recommended)
- Install required dependencies
- Update authentication methods
- Configure Firebase OAuth providers
- Test on all platforms

## Current Status

- ✅ **Firebase Auth**: Properly configured
- ✅ **Email/Password**: Working
- ❌ **Google OAuth**: Needs Web Client ID or Firebase integration
- ❌ **Apple OAuth**: Needs Firebase integration for better reliability

## Recommendation

For production apps, I recommend migrating to Firebase's built-in OAuth providers as they provide better security, reliability, and maintainability.
