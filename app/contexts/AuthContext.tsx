// app/context/AuthContext.tsx
// Global authentication state management

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeAuth,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, setAuthToken, removeAuthToken, clearApiOverride } from '../services/api';
import { makeRedirectUri } from 'expo-auth-session';
import * as AuthSession from 'expo-auth-session';
import * as FirebaseAuthNS from 'firebase/auth';
import { setUser as setSentryUser, clearUser as clearSentryUser, captureException } from '../services/sentry';

// Workaround for RN persistence: access symbol from namespace and cast to any to avoid TS type gaps
const getReactNativePersistence: ((storage: any) => any) | undefined = (FirebaseAuthNS as any).getReactNativePersistence;

// Complete the auth session
WebBrowser.maybeCompleteAuthSession();

// Firebase configuration - all values must be provided via environment variables
// SECURITY: Never hardcode API keys or sensitive credentials
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Validate required Firebase configuration
const requiredFirebaseKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = requiredFirebaseKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);

if (missingKeys.length > 0) {
  throw new Error(
    `Missing required Firebase configuration. Please add the following to your .env file:\n${
      missingKeys.map(key => `  - EXPO_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join('\n')
    }\n\nRefer to FIREBASE_OAUTH_SETUP.md for setup instructions.`
  );
}

// Initialize Firebase app once (avoid HMR duplicate init)
const app = (getApps().length ? getApp() : initializeApp(firebaseConfig));

// Initialize Firebase Auth explicitly with React Native persistence when available
// Avoid calling getAuth() before initializeAuth() to prevent memory-only persistence and warnings
const auth = getReactNativePersistence
  ? initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) })
  : getAuth(app);

// Configure Google Sign-In
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

interface User {
  id: string;
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  photoURL?: string;
  totalDistance: number;
  totalTime: number;
  topSpeed: number;
  totalTrips: number;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Warm up the browser for better UX on Android
  useEffect(() => {
    if (Platform.OS === 'android') {
      WebBrowser.warmUpAsync();
      return () => {
        WebBrowser.coolDownAsync();
      };
    }
  }, []);

  // Sync backend user data
  const syncUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      await setAuthToken(idToken);
      
      // Call backend to get/create user, include optional profile fields to avoid default 'Wayfarian User'
      const response = await authAPI.login(idToken, {
        displayName: firebaseUser.displayName || undefined,
        photoURL: firebaseUser.photoURL || undefined,
        phoneNumber: firebaseUser.phoneNumber || undefined,
      });
      
      if (response && response.success && response.user) {
        let srvUser = response.user as User;
        // Auto-fix generic display name if we can infer a better one
        if ((srvUser.displayName === 'Wayfarian User' || !srvUser.displayName) && (firebaseUser.displayName || firebaseUser.email)) {
          try {
            const inferred = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : undefined);
            if (inferred && inferred !== 'Wayfarian User') {
              const upd = await authAPI.updateProfile({ displayName: inferred });
              if (upd?.success && upd.user) {
                srvUser = upd.user as User;
              }
            }
          } catch {}
        }
        setUser(srvUser);
        setIsAuthenticated(true);
        return;
      }

      if (response && response.user) {
        setUser(response.user);
        setIsAuthenticated(true);
        return;
      }

      // If login failed or user not found, attempt auto-register once
      const registerResp = await authAPI.register(idToken, {});
      if (registerResp && (registerResp.user || registerResp.success)) {
        const createdUser = registerResp.user || registerResp.data || registerResp;
        if (createdUser) {
          setUser(createdUser.user || createdUser);
          setIsAuthenticated(true);
          return;
        }
      }

      // As a final check, try to fetch the current user if token is valid
      const me = await authAPI.getCurrentUser();
      if (me && me.success && me.user) {
        let srvUser = me.user as User;
        if ((srvUser.displayName === 'Wayfarian User' || !srvUser.displayName) && (firebaseUser.displayName || firebaseUser.email)) {
          try {
            const inferred = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : undefined);
            if (inferred && inferred !== 'Wayfarian User') {
              const upd = await authAPI.updateProfile({ displayName: inferred });
              if (upd?.success && upd.user) {
                srvUser = upd.user as User;
              }
            }
          } catch {}
        }
        setUser(srvUser);
        setIsAuthenticated(true);
        return;
      }

      // If register also fails, treat as backend unavailable
      throw new Error('Network request failed');
    } catch (error: any) {
      console.error('Error syncing user data:', error);
      // If backend is down, create a minimal user object from Firebase
      if (error?.message?.includes('Network request failed') || 
          error?.message?.includes('localhost') ||
          error?.message?.includes('Failed to sync user data')) {
        console.log('Backend unavailable, using Firebase user data');
        const minimalUser: User = {
          id: firebaseUser.uid,
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email || undefined,
          phoneNumber: firebaseUser.phoneNumber || undefined,
          displayName: firebaseUser.displayName || 'Wayfarian User',
          photoURL: firebaseUser.photoURL || undefined,
          totalDistance: 0,
          totalTime: 0,
          topSpeed: 0,
          totalTrips: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setUser(minimalUser);
        setIsAuthenticated(true);
        return;
      }
      throw error;
    }
  };

  // Monitor Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setFirebaseUser(firebaseUser);
          await syncUserData(firebaseUser);
        } else {
          setFirebaseUser(null);
          setUser(null);
          setIsAuthenticated(false);
          await removeAuthToken();
        }
      } catch (error) {
        console.error('Auth state change error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Login with email and password
  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      console.log('Starting login process...');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Firebase login successful');
      
      await syncUserData(userCredential.user);
      console.log('Login completed successfully');
      
    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = error.message || 'Failed to login';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please check your email or register.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password authentication is not enabled. Please contact support.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Please contact support.';
      }
      
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Register with email and password
  const register = async (email: string, password: string, displayName: string) => {
    try {
      setLoading(true);
      console.log('Starting registration process...');
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Firebase user created');
      
      // Update Firebase profile
      await updateProfile(userCredential.user, {
        displayName,
      });
      console.log('Firebase profile updated');
      
      // Sync with backend
      await syncUserData(userCredential.user);
      console.log('Registration completed successfully');
      
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // Provide more user-friendly error messages
      let errorMessage = error.message || 'Failed to register';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please try logging in instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password authentication is not enabled. Please contact support.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Login with Google - Using proper Expo AuthSession with Google-approved redirect URIs
  const loginWithGoogle = async () => {
    try {
      setLoading(true);
      
      // Check if Google Sign-In is configured
      if (!GOOGLE_WEB_CLIENT_ID) {
        throw new Error('Google Sign-In is not configured. Please add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.');
      }
      
      // For web platform, use Firebase's built-in Google provider
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        const result = await signInWithPopup(auth, provider);
        await syncUserData(result.user);
        return;
      }

      // For mobile platforms, use Expo AuthSession with proper redirect URI
      console.log('Starting Google OAuth flow...');
      console.log('Google Client ID:', GOOGLE_WEB_CLIENT_ID);

      // Use Expo's makeRedirectUri for proper redirect URI handling
      const redirectUri = makeRedirectUri({
        scheme: 'wayfarian-system', // Use your app scheme
        preferLocalhost: false, // Force use of Expo proxy instead of localhost
      });

      console.log('Using redirect URI:', redirectUri);
      
      // If makeRedirectUri still returns an exp:// URL, manually set the correct one
      const finalRedirectUri = redirectUri.startsWith('exp://') 
        ? 'https://auth.expo.io/@anonymous/wayfarian-system'
        : redirectUri;
        
      console.log('Final redirect URI:', finalRedirectUri);

      // Get Google's discovery document
      const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

      // Create auth request configuration
      const request = new AuthSession.AuthRequest({
        clientId: GOOGLE_WEB_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.Code,
        redirectUri: finalRedirectUri,
        prompt: AuthSession.Prompt.SelectAccount,
      });

      console.log('Making auth request...');
      const result = await request.promptAsync(discovery);
      
      console.log('Auth result:', { type: result.type });

      if (result.type === 'success') {
        console.log('Authorization successful, exchanging code for tokens...');
        
        if (!result.params.code) {
          throw new Error('No authorization code received');
        }

        // Exchange authorization code for tokens
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: GOOGLE_WEB_CLIENT_ID,
            code: result.params.code,
            redirectUri: finalRedirectUri,
            extraParams: {
              grant_type: 'authorization_code',
            },
          },
          discovery
        );

        if (!tokenResult.idToken) {
          console.error('Token exchange result:', tokenResult);
          throw new Error('No ID token received from Google');
        }

        console.log('Token exchange successful');

        // Create Firebase credential
        const googleCredential = GoogleAuthProvider.credential(tokenResult.idToken);
        
        // Sign in to Firebase
        console.log('Signing into Firebase...');
        const firebaseResult = await signInWithCredential(auth, googleCredential);
        console.log('Firebase sign-in successful');
        
        // Sync with backend
        console.log('Syncing with backend...');
        await syncUserData(firebaseResult.user);
        console.log('Google Sign-In completed successfully');
        
      } else if (result.type === 'cancel') {
        console.log('User cancelled Google Sign-In');
        return;
      } else {
        throw new Error('Google Sign-In was dismissed or failed');
      }
        
    } catch (error: any) {
      console.error('Google login error:', error);
      
      // Handle specific Firebase errors
      if (error.code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with this email address using a different sign-in method.');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('The credential received is malformed or has expired.');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Google sign-in is not enabled. Please contact support.');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('This account has been disabled. Please contact support.');
      } else {
        throw new Error(error.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Login with Apple
  const loginWithApple = async () => {
    try {
      setLoading(true);
      
      // Check if Apple Authentication is available (iOS only)
      if (Platform.OS !== 'ios') {
        throw new Error('Apple Sign-In is only available on iOS devices.');
      }
      
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple Sign-In is not available on this device.');
      }
      
      // Generate a nonce for additional security
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
        { encoding: Crypto.CryptoEncoding.BASE64 }
      );
      
      // Request Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      
      // Create Apple credential for Firebase
      const { identityToken } = credential;
      
      if (!identityToken) {
        throw new Error('Apple Sign-In failed: No identity token received.');
      }
      
      // Create Firebase credential
      const provider = new OAuthProvider('apple.com');
      const appleCredential = provider.credential({
        idToken: identityToken,
        rawNonce: nonce,
      });
      
      // Sign in with Firebase
      const userCredential = await signInWithCredential(auth, appleCredential);
      
      // Sync with backend
      await syncUserData(userCredential.user);
    } catch (error: any) {
      console.error('Apple login error:', error);
      
      // Handle specific Apple Sign-In errors
      if (error.code === 'ERR_CANCELED') {
        throw new Error('Apple Sign-In was canceled.');
      } else if (error.code === 'ERR_INVALID_RESPONSE') {
        throw new Error('Invalid response from Apple Sign-In.');
      } else if (error.code === 'ERR_NOT_HANDLED') {
        throw new Error('Apple Sign-In request was not handled.');
      } else if (error.code === 'ERR_UNKNOWN') {
        throw new Error('An unknown error occurred during Apple Sign-In.');
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with this email address using a different sign-in method.');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('The credential received is malformed or has expired.');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Apple sign-in is not enabled. Please contact support.');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('This account has been disabled. Please contact support.');
      } else {
        throw new Error(error.message || 'Apple sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    setLoading(true);
    try {
      // Attempt server-side logout, but don't block local cleanup on failure
      try {
        await authAPI.logout();
      } catch {
        console.warn('Server logout failed or unreachable; proceeding with local cleanup');
      }
    } finally {
      try {
        await signOut(auth);
      } catch {
        console.warn('Firebase signOut failed (possibly already signed out)');
      }
      // Clear local auth state regardless
      setUser(null);
      setFirebaseUser(null);
      setIsAuthenticated(false);
      try { await removeAuthToken(); } catch {}
      // Also clear any API base override so app can adopt the new backend automatically
      try { await clearApiOverride(); } catch {}
      setLoading(false);
    }
  };

  // Refresh user data
  const refreshUser = async () => {
    try {
      if (firebaseUser) {
        await syncUserData(firebaseUser);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    isAuthenticated,
    login,
    register,
    loginWithGoogle,
    loginWithApple,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;