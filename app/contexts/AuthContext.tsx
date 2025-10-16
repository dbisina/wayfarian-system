// app/context/AuthContext.tsx
// Global authentication state management

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  initializeAuth,
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
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { authAPI, setAuthToken, removeAuthToken } from '../services/api';

// Firebase configuration with fallback values for development
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDWB96a0zDAzAm_4ZA9oaR8nI8pnoNLfZk",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "wayfarian-e49b4.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "wayfarian-e49b4",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "wayfarian-e49b4.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "65260446195",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:65260446195:web:c11a2c5454f3bb65a83286",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth (persistence is handled automatically in React Native)
const auth = initializeAuth(app);

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

  // Sync backend user data
  const syncUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      await setAuthToken(idToken);
      
      // Call backend to get/create user
      const response = await authAPI.login(idToken, {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        phoneNumber: firebaseUser.phoneNumber,
      });
      
      if (response && response.success && response.user) {
        setUser(response.user);
        setIsAuthenticated(true);
        return;
      }

      if (response && response.user) {
        setUser(response.user);
        setIsAuthenticated(true);
        return;
      }

      // If response is null (API request failed) or doesn't have user data
      if (!response) {
        throw new Error('Network request failed');
      }

      throw new Error(response.message || 'Failed to sync user data');
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

  // Login with Google
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

      // For mobile platforms, use Expo AuthSession
      try {
        const redirectUri = AuthSession.makeRedirectUri();

        const request = new AuthSession.AuthRequest({
          clientId: GOOGLE_WEB_CLIENT_ID,
          scopes: ['openid', 'profile', 'email'],
          redirectUri,
          responseType: AuthSession.ResponseType.Code,
          extraParams: {},
          prompt: AuthSession.Prompt.SelectAccount,
        });

        const result = await request.promptAsync({
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        });

        if (result.type === 'success') {
          // Exchange the authorization code for tokens
          const tokenResponse = await AuthSession.exchangeCodeAsync(
            {
              clientId: GOOGLE_WEB_CLIENT_ID,
              code: result.params.code,
              redirectUri,
              extraParams: {
                code_verifier: request.codeVerifier || '',
              },
            },
            {
              tokenEndpoint: 'https://oauth2.googleapis.com/token',
            }
          );

          // Get user info from Google (for debugging if needed)
          // const userInfoResponse = await fetch(
          //   `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.accessToken}`
          // );
          // const userInfo = await userInfoResponse.json();

          // Create Firebase credential with Google ID token
          const googleCredential = GoogleAuthProvider.credential(tokenResponse.idToken);
          
          // Sign in to Firebase with Google credential
          const firebaseResult = await signInWithCredential(auth, googleCredential);
          
          // Sync with backend
          await syncUserData(firebaseResult.user);
          
        } else if (result.type === 'cancel') {
          // User canceled - don't throw error, just return silently
          console.log('Google Sign-In was canceled by user');
          return;
        } else {
          throw new Error('Google Sign-In failed. Please try again.');
        }
        
      } catch (googleError: any) {
        console.error('Google Sign-In error:', googleError);
        
        // Handle specific Google Sign-In errors
        if (googleError.message?.includes('canceled')) {
          // User canceled - don't throw error
          return;
        } else if (googleError.message?.includes('network')) {
          throw new Error('Network error. Please check your internet connection and try again.');
        } else if (googleError.message?.includes('invalid_client')) {
          throw new Error('Google Sign-In configuration error. Please contact support.');
        } else {
          throw new Error(`Google Sign-In failed: ${googleError.message}`);
        }
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
    try {
      setLoading(true);
      
      // Sign out from Firebase
      await authAPI.logout();
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
      setIsAuthenticated(false);
      await removeAuthToken();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
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