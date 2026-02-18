// app/context/AuthContext.tsx
// Global authentication state management

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Buffer } from 'buffer';
import { initializeApp, getApps, getApp } from 'firebase/app';
import Constants from 'expo-constants';
import { makeRedirectUri, fetchDiscoveryAsync, AuthRequest, ResponseType, type AuthSessionResult } from 'expo-auth-session';
import { 
  initializeAuth,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail,
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
import { authAPI, setAuthToken, removeAuthToken } from '../services/api';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as FirebaseAuthNS from 'firebase/auth';
import { getBoolSync, setBoolSync } from '../services/storage';
import { setUser as setSentryUser, clearUser as clearSentryUser, captureException } from '../services/sentry';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

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

// Initialize Firebase Auth explicitly with React Native persistence when available.
// We attempt initializeAuth first so the persistence layer is applied on the initial run.
let auth: FirebaseAuthNS.Auth;
try {
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    const persistenceOptions = getReactNativePersistence
      ? { persistence: getReactNativePersistence(ReactNativeAsyncStorage) }
      : undefined;
    auth = initializeAuth(app, persistenceOptions ?? {});
  }
} catch {
  // If an auth instance already exists (e.g., during Fast Refresh), re-use it.
  auth = getAuth(app);
}

// Configure Google Sign-In
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

interface User {
  id: string;
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  photoURL?: string;
  country?: string;
  countryCode?: string;
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
  isInitializing: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  hasCompletedProfileSetup: boolean;
  isNewSignUp: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: (updatedUser?: Partial<User>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  completeProfileSetup: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const useSentryContextBridge = () => {
  const lastUserIdRef = useRef<string | null>(null);

  const setUserContext = useCallback((user: User | null) => {
    try {
      const nextId = user?.id ?? null;
      if (nextId === lastUserIdRef.current) {
        return;
      }
      if (user) {
        setSentryUser({
          id: user.id,
          email: user.email,
          username: user.displayName,
        });
      } else {
        clearSentryUser();
      }
      lastUserIdRef.current = nextId;
    } catch (error) {
      console.error('Failed to update Sentry user context:', error);
      const normalized = error instanceof Error ? error : new Error(String(error));
      captureException(normalized);
    }
  }, []);

  return { setUserContext };
};

interface AuthProviderProps {
  children: ReactNode;
}

const ONBOARDING_KEY = '@wayfarian:onboarding_completed';
const PROFILE_SETUP_KEY = '@wayfarian:profile_setup_completed';
const USER_DATA_KEY = '@wayfarian:user_data';
// MMKV keys for synchronous cold-start reads (eliminates onboarding flash)
const MMKV_AUTH_KEY = 'wayfarian:is_authenticated';
const MMKV_ONBOARDING_KEY = 'wayfarian:onboarding_completed';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setRawUser] = useState<User | null>(null);

  const setUser = useCallback(async (newUser: User | null) => {
    setRawUser(newUser);
    try {
      if (newUser) {
        await ReactNativeAsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));
      } else {
        await ReactNativeAsyncStorage.removeItem(USER_DATA_KEY);
      }
    } catch (error) {
      console.error('[AuthContext] Failed to persist user:', error);
    }
  }, []);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Initialize from MMKV (synchronous) so first render already has correct auth state
  // This prevents the onboarding page from flashing on cold start for authenticated users
  const [isAuthenticated, setIsAuthenticated] = useState(() => getBoolSync(MMKV_AUTH_KEY, false));
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => getBoolSync(MMKV_ONBOARDING_KEY, false));
  const [hasCompletedProfileSetup, setHasCompletedProfileSetup] = useState(true); // Default true - only false for new signups
  const [isNewSignUp, setIsNewSignUp] = useState(false);
  const [onboardingStatusChecked, setOnboardingStatusChecked] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const { setUserContext } = useSentryContextBridge();
  const tokenRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const currentUserRef = useRef<User | null>(null);
  // CRITICAL: Track whether the user was previously authenticated (from MMKV sync read)
  // This prevents onAuthStateChanged's initial null callback from wiping isAuthenticated
  // before the async cached-user restore from AsyncStorage completes.
  const wasAuthenticatedRef = useRef<boolean>(getBoolSync(MMKV_AUTH_KEY, false));
  // Track whether the first real Firebase auth state has been resolved
  const firstAuthResolvedRef = useRef(false);

  // Sync auth/onboarding state to MMKV for instant cold-start reads
  // This eliminates the onboarding page flash for already-authenticated users
  useEffect(() => { setBoolSync(MMKV_AUTH_KEY, isAuthenticated); }, [isAuthenticated]);
  useEffect(() => { setBoolSync(MMKV_ONBOARDING_KEY, hasCompletedOnboarding); }, [hasCompletedOnboarding]);

  const clearTokenRefreshTimer = useCallback(() => {
    if (tokenRefreshTimeoutRef.current) {
      clearTimeout(tokenRefreshTimeoutRef.current);
      tokenRefreshTimeoutRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(async (fbUser: FirebaseUser) => {
    try {
      const token = await fbUser.getIdToken();
      await setAuthToken(token);

      const [, payload] = token.split('.');
      if (!payload) {
        return;
      }

      let expiresAtMs: number | null = null;
      try {
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
        if (decoded?.exp) {
          expiresAtMs = decoded.exp * 1000;
        }
      } catch (decodeError) {
        console.warn('Failed to decode token payload for refresh scheduling:', decodeError);
      }

      if (!expiresAtMs) {
        return;
      }

      const refreshInMs = Math.max(expiresAtMs - Date.now() - 2 * 60 * 1000, 30_000);

      clearTokenRefreshTimer();
      tokenRefreshTimeoutRef.current = setTimeout(async () => {
        try {
          const refreshed = await fbUser.getIdToken(true);
          await setAuthToken(refreshed);
        } catch (refreshError) {
          console.warn('Auth token auto-refresh failed:', refreshError);
        } finally {
          scheduleTokenRefresh(fbUser).catch(() => {});
        }
      }, refreshInMs);
    } catch (error) {
      console.warn('Unable to schedule auth token refresh:', error);
    }
  }, [clearTokenRefreshTimer]);

  useEffect(() => {
    if (Constants.appOwnership !== 'expo' && Platform.OS !== 'web' && GOOGLE_WEB_CLIENT_ID) {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        offlineAccess: true,
        ...(GOOGLE_ANDROID_CLIENT_ID ? { androidClientId: GOOGLE_ANDROID_CLIENT_ID } : {}),
        // iosClientId is NOT set here - we rely on GoogleService-Info.plist for iOS configuration
        // to avoid mismatch crashes.
      });
    }
  }, []);

  // Warm up the browser for better UX on Android
  useEffect(() => {
    if (Platform.OS === 'android') {
      WebBrowser.warmUpAsync().catch(() => {});
      return () => {
        WebBrowser.coolDownAsync().catch(() => {});
      };
    }
  }, []);

  // Sync backend user data
  const syncUserData = useCallback(async (firebaseUser: FirebaseUser) => {
    // FIX: Check and set synchronously to prevent race condition
    // If another sync is in progress, wait for it
    if (syncInFlightRef.current) {
      console.log('[AuthContext] syncUserData: waiting for in-flight sync');
      await syncInFlightRef.current;
      return;
    }

    // Create a deferred promise that we set synchronously BEFORE any async work
    // This prevents the race condition where two calls both see null
    let resolveSync: () => void;
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });
    syncInFlightRef.current = syncPromise;

    const executeSync = (async () => {
      const normalizeUser = (payload: any): User | null => {
        if (!payload) {
          console.warn('[AuthContext] normalizeUser: payload is empty');
          return null;
        }
        console.log('[AuthContext] normalizeUser: payload:', JSON.stringify(payload).substring(0, 200));
        const candidate = payload.user ?? payload.data?.user ?? payload.data ?? (payload.success ? payload.user ?? payload.data : payload);
        
        if (candidate && typeof candidate === 'object') {
          if ('id' in candidate) {
               console.log('[AuthContext] normalizeUser: found valid user', candidate.id);
               return candidate as User;
          } else {
               console.warn('[AuthContext] normalizeUser: candidate missing "id" property:', Object.keys(candidate));
          }
        } else {
             console.warn('[AuthContext] normalizeUser: found no candidate object');
        }
        return null;
      };

      const attemptFetchCurrentUser = async (): Promise<User | null> => {
        try {
          const me = await authAPI.getCurrentUser();
          return normalizeUser(me);
        } catch {
          return null;
        }
      };

      // Get token and store it
      const idToken = await firebaseUser.getIdToken();
      
      // OPTIMIZATION: Store token in background (non-blocking)
      // Thanks to in-memory caching in api.ts, the token is available immediately
      // for subsequent requests even before Async/SecureStore finishes writing.
      setAuthToken(idToken).catch((err) => 
        console.warn('[AuthContext] Background token storage failed:', err)
      );

      // OPTIMIZATION: Set authenticated optimistically before backend sync
      // This makes the app feel faster as navigation happens immediately
      setIsAuthenticated(true);
      console.log('[AuthContext] Optimistic auth set - syncing with backend...');

      let backendUser: User | null = null;

      try {
        const response = await authAPI.login(idToken, {
          displayName: firebaseUser.displayName || undefined,
          photoURL: firebaseUser.photoURL || undefined,
          phoneNumber: firebaseUser.phoneNumber || undefined,
        });
        backendUser = normalizeUser(response);
      } catch (error: any) {
        const message = String(error?.message || '');
        const status = error?.status;
        const isRecoverable = 
          status === 429 || 
          /Too many requests|Network request failed|Failed to fetch|timed out/i.test(message);
        
        console.error('[AuthContext] syncUserData error:', message, 'Status:', status);

        if (isRecoverable) {
          // Try direct fetch as fallback
          backendUser = await attemptFetchCurrentUser();
          
          // CRITICAL: Use cached user if available, even on cold start
          if (!backendUser && currentUserRef.current) {
            backendUser = currentUserRef.current;
          }
          
          // If we still have no backend user but Firebase session is valid,
          // keep authenticated state (already set optimistically) and schedule refresh
          if (!backendUser) {
            console.warn('[AuthContext] Backend unreachable, preserving Firebase session');
            // Schedule token refresh to attempt backend sync later
            scheduleTokenRefresh(firebaseUser).catch(() => {});
            return;
          }
        } else {
          // Non-recoverable error - revert optimistic auth
          setIsAuthenticated(false);
          throw error;
        }
      }

      if (!backendUser) {
        backendUser = await attemptFetchCurrentUser();
      }

      if (!backendUser) {
        // Revert optimistic auth on failure
        setIsAuthenticated(false);
        throw new Error('Unable to load Wayfarian account details.');
      }

      let srvUser = backendUser;

      if ((srvUser.displayName === 'Wayfarian User' || !srvUser.displayName) && (firebaseUser.displayName || firebaseUser.email)) {
        try {
          const inferred = firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : undefined);
          if (inferred && inferred !== 'Wayfarian User') {
            const updated = await authAPI.updateProfile({ displayName: inferred });
            const normalizedUpdated = normalizeUser(updated);
            if (normalizedUpdated) {
              srvUser = normalizedUpdated;
            } else {
              srvUser = { ...srvUser, displayName: inferred };
            }
          }
        } catch (updateError) {
          console.warn('Failed to auto-update display name:', updateError);
        }
      }

      console.log('[AuthContext] Setting user state:', srvUser.id);
      setUser(srvUser);
      // Auth already set optimistically, just confirm
      console.log('[AuthContext] Backend sync complete');
      setUserContext(srvUser);
      
      // Schedule token refresh in background (non-blocking)
      scheduleTokenRefresh(firebaseUser).catch((err) => {
        console.warn('[AuthContext] Token refresh scheduling failed:', err);
      });
    })();

    try {
      await executeSync;
    } catch (error: any) {
      const existingUser = currentUserRef.current;
      const message = String(error?.message || '');
      const status = error?.status;
      const isRecoverable = 
        status === 429 || 
        /Network request failed|Failed to fetch|timed out/i.test(message);

      // CRITICAL: On cold start with network issues, preserve Firebase session
      if (isRecoverable) {
        console.warn('[AuthContext] Backend sync failed, preserving Firebase session');
        setIsAuthenticated(true);
        if (existingUser) {
          setUserContext(existingUser);
        }
        return;
      }

      // Only clear auth on non-recoverable errors (invalid token, account disabled, etc.)
      console.error('[AuthContext] Critical auth error, signing out:', error);
      clearTokenRefreshTimer();
      await removeAuthToken();
      setUser(null);
      setIsAuthenticated(false);
      setUserContext(null);

      throw new Error(
        isRecoverable
          ? 'Unable to reach Wayfarian servers. Please try again in a moment.'
          : (message || 'Failed to sync user data')
      );
    } finally {
      // Resolve the deferred promise and clear the ref
      resolveSync!();
      syncInFlightRef.current = null;
    }
  }, [setUserContext, scheduleTokenRefresh, clearTokenRefreshTimer]);
  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  // CRITICAL: Load onboarding state FIRST before Firebase restores session
  useEffect(() => {
    let mounted = true;
    
    const initializeAuthState = async () => {
      try {
        // 1. Load onboarding flag from AsyncStorage
        if (__DEV__) console.log('[AuthContext] Loading onboarding state from AsyncStorage...');
        const completed = await ReactNativeAsyncStorage.getItem(ONBOARDING_KEY);
        if (__DEV__) console.log('[AuthContext] Onboarding flag retrieved:', completed);
        
        // 2. Load profile setup flag
        const profileSetupCompleted = await ReactNativeAsyncStorage.getItem(PROFILE_SETUP_KEY);
        if (__DEV__) console.log('[AuthContext] Profile setup flag retrieved:', profileSetupCompleted);
        
        // 3. Load cached user data
        const cachedUserJson = await ReactNativeAsyncStorage.getItem(USER_DATA_KEY);

        if (mounted) {
          setHasCompletedOnboarding(completed === 'true');
          // If profile setup is explicitly 'false', user needs to complete it
          // Otherwise default to true (existing users)
          setHasCompletedProfileSetup(profileSetupCompleted !== 'false');
          if (__DEV__) console.log('[AuthContext] hasCompletedOnboarding set to:', completed === 'true');
          if (__DEV__) console.log('[AuthContext] hasCompletedProfileSetup set to:', profileSetupCompleted !== 'false');

          if (cachedUserJson) {
            try {
              const cachedUser = JSON.parse(cachedUserJson);
              if (__DEV__) console.log('[AuthContext] Restoring cached user session');
              setRawUser(cachedUser);
              currentUserRef.current = cachedUser;
              setIsAuthenticated(true);
              setUserContext(cachedUser);
              // Only auto-complete onboarding if we have a valid cached user AND onboarding wasn't explicitly false
              if (completed !== 'false') {
                setHasCompletedOnboarding(true);
              }
            } catch (e) {
              console.warn('[AuthContext] Failed to parse cached user:', e);
            }
          }
        }
      } catch (error) {
        console.error('[AuthContext] Failed to load onboarding state:', error);
      } finally {
        if (mounted) {
          setOnboardingStatusChecked(true);
        }
      }
    };

    initializeAuthState();
    
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || hasCompletedOnboarding) {
      return;
    }

    let canceled = false;
    const persistOnboardingFlag = async () => {
      try {
        await ReactNativeAsyncStorage.setItem(ONBOARDING_KEY, 'true');
        if (!canceled) {
          setHasCompletedOnboarding(true);
          setOnboardingStatusChecked(true);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to auto-complete onboarding for authenticated user:', error);
      }
    };

    persistOnboardingFlag();

    return () => {
      canceled = true;
    };
  }, [isAuthenticated, hasCompletedOnboarding]);

  // Monitor Firebase auth state - this triggers AFTER Firebase persistence restores the session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setFirebaseUser(firebaseUser);
          // Firebase confirmed a real user — mark as resolved and update MMKV guard
          firstAuthResolvedRef.current = true;
          wasAuthenticatedRef.current = true;
          try {
            await syncUserData(firebaseUser);
          } catch (syncError: any) {
            // If sync fails due to rate-limiting or network but we have cached user, preserve auth
            const isRecoverable = syncError?.status === 429 || /Too many requests|Network request failed|Failed to fetch/i.test(syncError?.message);
            if (isRecoverable && currentUserRef.current) {
              setIsAuthenticated(true);
            } else {
              throw syncError;
            }
          }
        } else {
          // CRITICAL FIX: Don't clear cached user session if we restored it from AsyncStorage
          // Firebase may fire null initially before session restoration on some devices
          //
          // Race condition prevention: On cold start, Firebase's onAuthStateChanged fires null
          // BEFORE the async initializeAuthState effect loads the cached user from AsyncStorage.
          // Without this guard, isAuthenticated flips false → true, causing a flash of the
          // onboarding/auth screen for already-authenticated users.
          //
          // We check three things:
          // 1. currentUserRef.current — set by initializeAuthState once cached user is loaded
          // 2. wasAuthenticatedRef.current — synchronously read from MMKV at init time
          // 3. firstAuthResolvedRef — only skip the very first null callback, not real signouts
          if (!currentUserRef.current && !wasAuthenticatedRef.current) {
            // User was genuinely not authenticated — safe to clear
            setFirebaseUser(null);
            setUser(null);
            setIsAuthenticated(false);
            setUserContext(null);
            clearTokenRefreshTimer();
            await removeAuthToken();
          } else if (!currentUserRef.current && wasAuthenticatedRef.current && !firstAuthResolvedRef.current) {
            // User was previously authenticated (MMKV says so), but Firebase fired null
            // before the async cached user loaded. Don't clear — wait for Firebase session
            // restoration or the cached user to load.
            if (__DEV__) console.log('[AuthContext] Firebase null before cached user loaded, preserving MMKV auth state');
            setFirebaseUser(null);
            // Don't clear isAuthenticated or user — MMKV says they were authenticated
          } else {
            // We have a cached user from AsyncStorage - preserve the session
            // This handles cold starts where Firebase doesn't immediately restore the session
            if (__DEV__) console.log('[AuthContext] Firebase returned null but cached user exists, preserving session');
            setFirebaseUser(null); // Firebase user is null, but our app user is still valid
          }
          firstAuthResolvedRef.current = true;
        }
      } catch (error) {
        console.error('[AuthContext] Auth state change error:', error);
        try {
          await signOut(auth);
        } catch (e) { console.warn('Failed to sign out after auth error:', e); }
        clearTokenRefreshTimer();
        await removeAuthToken();
        setUser(null);
        setIsAuthenticated(false);
        setUserContext(null);
      } finally {
        setLoading(false);
        setInitializing(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setUserContext, syncUserData, clearTokenRefreshTimer]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (latestUser) => {
      if (latestUser) {
        scheduleTokenRefresh(latestUser).catch((error) => {
          console.warn('Failed to refresh auth token on change:', error);
        });
      } else {
        clearTokenRefreshTimer();
        removeAuthToken().catch((error) => {
          console.warn('Failed to clear auth token on sign-out:', error);
        });
      }
    });

    return () => unsubscribe();
  }, [scheduleTokenRefresh, clearTokenRefreshTimer]);

  useEffect(() => {
    return () => {
      clearTokenRefreshTimer();
    };
  }, [clearTokenRefreshTimer]);

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

      try {
        await signOut(auth);
      } catch (e) { console.warn('Failed to sign out after login error:', e); }
      await removeAuthToken();
      setUser(null);
      setIsAuthenticated(false);
      setUserContext(null);
      
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
      
      // Mark as new signup - needs to complete profile setup
      setIsNewSignUp(true);
      setHasCompletedProfileSetup(false);
      await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'false');
      
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

      try {
        await signOut(auth);
      } catch (e) { console.warn('Failed to sign out after registration error:', e); }
      await removeAuthToken();
      setUser(null);
      setIsAuthenticated(false);
      setUserContext(null);
      
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

      // If running inside Expo Go, fall back to AuthSession-based flow
      if (Constants.appOwnership === 'expo') {
        const redirectUri = makeRedirectUri({
          scheme: 'app',
          preferLocalhost: false,
        });

        const discovery = await fetchDiscoveryAsync('https://accounts.google.com');
        const request = new AuthRequest({
          clientId: GOOGLE_WEB_CLIENT_ID,
          responseType: ResponseType.IdToken,
          scopes: ['openid', 'profile', 'email'],
          redirectUri,
          extraParams: {
            prompt: 'select_account',
          },
        });

  const result = (await request.promptAsync(discovery, { useProxy: true } as any)) as AuthSessionResult;

        if (result.type === 'cancel' || result.type === 'dismiss') {
          return;
        }

        if (result.type !== 'success') {
          throw new Error('Google Sign-In was interrupted. Please try again.');
        }

        const idToken = result.authentication?.idToken ?? result.params?.id_token;
        if (!idToken) {
          throw new Error(result.params?.error_description || 'Google Sign-In failed. Please try again.');
        }

        const googleCredential = GoogleAuthProvider.credential(idToken);
        const firebaseResult = await signInWithCredential(auth, googleCredential);
        
        // Check if this is a new user (first-time signup with Google)
        const isNewUser = (firebaseResult as any)._tokenResponse?.isNewUser || 
          (firebaseResult.user.metadata.creationTime === firebaseResult.user.metadata.lastSignInTime);
        if (isNewUser) {
          setIsNewSignUp(true);
          setHasCompletedProfileSetup(false);
          await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'false');
        }
        
        await syncUserData(firebaseResult.user);
        return;
      }

      // For native builds, use @react-native-google-signin
      // hasPlayServices is Android-only, don't call on iOS
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      
      const signInResult = await GoogleSignin.signIn();
      const idToken = (signInResult as unknown as { idToken?: string })?.idToken ?? (signInResult as any)?.data?.idToken;

      if (!idToken) {
        throw new Error('Google Sign-In failed: No ID token received.');
      }

      const googleCredential = GoogleAuthProvider.credential(idToken);
      const firebaseResult = await signInWithCredential(auth, googleCredential);
      
      // Check if this is a new user (first-time signup with Google)
      const isNewUser = (firebaseResult as any)._tokenResponse?.isNewUser || 
        (firebaseResult.user.metadata.creationTime === firebaseResult.user.metadata.lastSignInTime);
      if (isNewUser) {
        setIsNewSignUp(true);
        setHasCompletedProfileSetup(false);
        await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'false');
      }
      
      await syncUserData(firebaseResult.user);
        
    } catch (error: any) {
      console.error('Google login error:', error);

      // Handle user cancellation - don't show error
      if (error.code === 12501 || error.code === '-5' || error.message?.includes('SIGN_IN_CANCELLED')) {
        return; // User cancelled, so we just return without an error
      }

      let errorMessage = error?.message || 'Google sign-in failed. Please try again.';
      
      // Handle Google Play Services unavailable (Huawei/HMS devices)
      if (
        error.code === 'PLAY_SERVICES_NOT_AVAILABLE' ||
        error.code === 1 ||
        error.message?.includes('PLAY_SERVICES_NOT_AVAILABLE') ||
        error.message?.includes('Google Play Services') ||
        error.message?.includes('play services')
      ) {
        errorMessage = 'Google Sign-In is not available on this device. Please use email and password to sign in.';
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'An account already exists with this email address using a different sign-in method.';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'The credential received is malformed or has expired.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Google sign-in is not enabled. Please contact support.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Please contact support.';
      }

      try {
        await signOut(auth);
      } catch (e) { console.warn('Failed to sign out after Google login error:', e); }
      await removeAuthToken();
      setUser(null);
      setIsAuthenticated(false);
      setUserContext(null);

      throw new Error(errorMessage);
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
      
      // Generate a nonce for additional security using cryptographically secure randomness
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const nonce = Buffer.from(randomBytes)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
        .substring(0, 32);
      
      // Hash the nonce with SHA256 and encode as HEX (not base64)
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
        { encoding: Crypto.CryptoEncoding.HEX }
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
      
      // Check if this is a new user (first-time signup with Apple)
      const isNewUser = (userCredential as any)._tokenResponse?.isNewUser || 
        (userCredential.user.metadata.creationTime === userCredential.user.metadata.lastSignInTime);
      if (isNewUser) {
        setIsNewSignUp(true);
        setHasCompletedProfileSetup(false);
        await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'false');
      }
      
      // Sync with backend
      await syncUserData(userCredential.user);
    } catch (error: any) {
      console.error('Apple login error:', error);
      // Detailed error logging for debugging malformed credentials
      if (error.code) console.error('Apple Error Code:', error.code);
      if (error.message) console.error('Apple Error Message:', error.message);
      
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
      if (Platform.OS !== 'web') {
        try {
          await GoogleSignin.signOut();
        } catch (err) {
          console.warn('Google sign-out failed:', err);
        }
      }
      try {
        await signOut(auth);
      } catch {
        console.warn('Firebase signOut failed (possibly already signed out)');
      }
      // Clear local auth state regardless
      clearTokenRefreshTimer();
      // CRITICAL: Clear currentUserRef BEFORE setUser so onAuthStateChanged doesn't preserve stale session
      currentUserRef.current = null;
      // Clear MMKV auth guard so onAuthStateChanged null callback properly clears state on next launch
      wasAuthenticatedRef.current = false;
      setUser(null);
      setFirebaseUser(null);
      setIsAuthenticated(false);
      setUserContext(null);
      try { await removeAuthToken(); } catch (e) { console.warn('Failed to remove auth token during logout:', e); }
      setLoading(false);
    }
  };

  // Refresh user data
  const refreshUser = async (updatedUser?: Partial<User>) => {
    try {
      if (updatedUser && user) {
        const newUser = { ...user, ...updatedUser };
        setUser(newUser);
        setUserContext(newUser);

        if (firebaseUser) {
          const desiredDisplayName = updatedUser.displayName ?? user.displayName;
          const desiredPhotoURL = updatedUser.photoURL ?? user.photoURL;
          const needsDisplayNameSync = Boolean(
            desiredDisplayName && desiredDisplayName !== firebaseUser.displayName
          );
          const needsPhotoSync = Boolean(
            desiredPhotoURL && desiredPhotoURL !== firebaseUser.photoURL
          );

          if (needsDisplayNameSync || needsPhotoSync) {
            try {
              await updateProfile(firebaseUser, {
                ...(needsDisplayNameSync ? { displayName: desiredDisplayName ?? undefined } : {}),
                ...(needsPhotoSync ? { photoURL: desiredPhotoURL ?? undefined } : {}),
              });
            } catch (profileSyncError) {
              console.warn('Failed to sync Firebase profile after update:', profileSyncError);
            }
          }
        }
        return;
      }

      if (firebaseUser) {
        await syncUserData(firebaseUser);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    try {
      console.log('[AuthContext] Marking onboarding complete, writing to AsyncStorage...');
      await ReactNativeAsyncStorage.setItem(ONBOARDING_KEY, 'true');
      const verify = await ReactNativeAsyncStorage.getItem(ONBOARDING_KEY);
      console.log('[AuthContext] Onboarding flag written and verified:', verify);
      setHasCompletedOnboarding(true);
      setOnboardingStatusChecked(true);
    } catch (error) {
      console.error('[AuthContext] Failed to save onboarding completion:', error);
      throw error;
    }
  };

  // Complete profile setup (called after new user finishes profile-setup screen)
  const completeProfileSetup = async () => {
    try {
      console.log('[AuthContext] Marking profile setup complete...');
      await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'true');
      setHasCompletedProfileSetup(true);
      setIsNewSignUp(false);
      console.log('[AuthContext] Profile setup completed');
    } catch (error) {
      console.error('[AuthContext] Failed to save profile setup completion:', error);
      throw error;
    }
  };

  // Send password reset email
  const resetPassword = async (email: string) => {
    if (!email) {
      throw new Error('Please provide an email address.');
    }

    try {
      const trimmedEmail = email.trim();
      await sendPasswordResetEmail(auth, trimmedEmail);
    } catch (error: any) {
      console.error('Password reset error:', error);

      if (error?.code === 'auth/user-not-found') {
        // Silently succeed to avoid account enumeration
        return;
      }

      let errorMessage = error?.message || 'Failed to send password reset email. Please try again.';

      if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many password reset attempts. Please try again later.';
      }

      throw new Error(errorMessage);
    }
  };

  // Delete user account
  const deleteAccount = async () => {
    try {
      setLoading(true);
      
      // 1. Delete from backend first
      try {
        await authAPI.deleteAccount();
      } catch (backendError: any) {
        // If backend returns that user owns groups with members, surface this to user
        if (backendError?.body?.groupsWithMembers) {
          throw new Error(backendError.message || 'You must transfer ownership or delete groups before deleting your account.');
        }
        throw backendError;
      }
      
      // 2. Delete Firebase user - this will trigger auth state change
      if (firebaseUser) {
        try {
          // For Firebase, we need to delete the user
          // Note: This requires recent authentication
          await firebaseUser.delete();
        } catch (firebaseError: any) {
          // If requires-recent-login, we need to inform the user
          if (firebaseError.code === 'auth/requires-recent-login') {
            // Backend data is already deleted, but Firebase auth remains
            // Sign out locally and inform user they need to re-authenticate
            console.warn('Firebase user deletion requires recent login - backend data deleted but Firebase auth remains');
            throw new Error('Please sign in again and retry to complete account deletion.');
          }
          // For other Firebase errors, log but proceed (backend data is already deleted)
          console.warn('Firebase user deletion failed (backend already deleted):', firebaseError);
        }
      }
      
      // 3. Clean up local state (similar to logout)
      if (Platform.OS !== 'web') {
        try {
          await GoogleSignin.signOut();
        } catch (err) {
          console.warn('Google sign-out failed during account deletion:', err);
        }
      }
      try {
        await signOut(auth);
      } catch {
        console.warn('Firebase signOut failed during account deletion');
      }
      
      // Clear local auth state
      clearTokenRefreshTimer();
      // CRITICAL: Clear currentUserRef BEFORE setUser so onAuthStateChanged doesn't preserve stale session
      currentUserRef.current = null;
      wasAuthenticatedRef.current = false;
      setUser(null);
      setFirebaseUser(null);
      setIsAuthenticated(false);
      setUserContext(null);
      
      // CRITICAL: Clear ALL cached data from AsyncStorage to prevent stale session restoration
      try {
        await Promise.all([
          removeAuthToken(),
          ReactNativeAsyncStorage.removeItem(USER_DATA_KEY),
          ReactNativeAsyncStorage.removeItem(ONBOARDING_KEY),
          ReactNativeAsyncStorage.removeItem(PROFILE_SETUP_KEY),
        ]);
      } catch (e) {
        console.warn('Failed to clear cached data during account deletion:', e);
      }
      
    } catch (error: any) {
      console.error('Delete account error:', error);
      throw new Error(error.message || 'Failed to delete account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    isInitializing: initializing || !onboardingStatusChecked,
    isAuthenticated,
    hasCompletedOnboarding,
    hasCompletedProfileSetup,
    isNewSignUp,
    login,
    register,
    loginWithGoogle,
    loginWithApple,
    logout,
    deleteAccount,
    refreshUser,
    completeOnboarding,
    completeProfileSetup,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;