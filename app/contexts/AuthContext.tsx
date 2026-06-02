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
import { authAPI, setAuthToken, removeAuthToken, setAuthSessionExpiredHandler } from '../services/api';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as FirebaseAuthNS from 'firebase/auth';
import { getBoolSync, setBoolSync } from '../services/storage';
import { setUser as setSentryUser, clearUser as clearSentryUser, captureException } from '../services/sentry';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

// RN persistence requires accessing the symbol from the namespace; the type gap requires a cast.
const getReactNativePersistence: ((storage: any) => any) | undefined = (FirebaseAuthNS as any).getReactNativePersistence;

WebBrowser.maybeCompleteAuthSession();

// All values come from environment variables — never hardcode credentials here.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const requiredFirebaseKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = requiredFirebaseKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);

if (missingKeys.length > 0) {
  throw new Error(
    `Missing required Firebase configuration. Please add the following to your .env file:\n${
      missingKeys.map(key => `  - EXPO_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join('\n')
    }\n\nRefer to FIREBASE_OAUTH_SETUP.md for setup instructions.`
  );
}

// Guard against duplicate initialisation during HMR.
const app = (getApps().length ? getApp() : initializeApp(firebaseConfig));

// Attempt initializeAuth with RN persistence on first load; fall back to getAuth on subsequent
// HMR cycles where the auth instance already exists.
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
  auth = getAuth(app);
}

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Wayfarian backend user profile. */
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

/** Shape of the auth context value exposed to consumers. */
interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  /** True while the initial Firebase session restore and AsyncStorage reads are in-flight. */
  isInitializing: boolean;
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  hasCompletedProfileSetup: boolean;
  /** True only for the session immediately after a new account is created. */
  isNewSignUp: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Re-syncs user data from the backend, or merges a partial update locally to avoid a round-trip. */
  refreshUser: (updatedUser?: Partial<User>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  completeProfileSetup: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Returns the auth context.
 * Must be called inside an `AuthProvider`.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Thin bridge that keeps Sentry's user context in sync with auth state.
 * Deduplicates updates by tracking the last-set user ID via a ref.
 */
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
// MMKV keys allow synchronous reads on cold start, eliminating the onboarding-flash problem.
const MMKV_AUTH_KEY = 'wayfarian:is_authenticated';
const MMKV_ONBOARDING_KEY = 'wayfarian:onboarding_completed';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setRawUser] = useState<User | null>(null);

  /** Wrapper that keeps AsyncStorage in sync whenever the in-memory user changes. */
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
  // Synchronous MMKV read on first render prevents the onboarding page from flashing
  // for already-authenticated users before the async Firebase restore completes.
  const [isAuthenticated, setIsAuthenticated] = useState(() => getBoolSync(MMKV_AUTH_KEY, false));
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => getBoolSync(MMKV_ONBOARDING_KEY, false));
  // Default true — only new sign-ups need the profile-setup screen.
  const [hasCompletedProfileSetup, setHasCompletedProfileSetup] = useState(true);
  const [isNewSignUp, setIsNewSignUp] = useState(false);
  const [onboardingStatusChecked, setOnboardingStatusChecked] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const { setUserContext } = useSentryContextBridge();
  const tokenRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firebaseNullGraceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const currentUserRef = useRef<User | null>(null);
  // Synchronously seeded from MMKV so the onAuthStateChanged null callback can't wipe
  // isAuthenticated before the async cached-user restore from AsyncStorage completes.
  const wasAuthenticatedRef = useRef<boolean>(getBoolSync(MMKV_AUTH_KEY, false));
  // Only skip the very first null callback from onAuthStateChanged, not real sign-outs.
  const firstAuthResolvedRef = useRef(false);

  // Mirror auth/onboarding flags to MMKV so the next cold start reads them synchronously.
  useEffect(() => { setBoolSync(MMKV_AUTH_KEY, isAuthenticated); }, [isAuthenticated]);
  useEffect(() => { setBoolSync(MMKV_ONBOARDING_KEY, hasCompletedOnboarding); }, [hasCompletedOnboarding]);

  const clearTokenRefreshTimer = useCallback(() => {
    if (tokenRefreshTimeoutRef.current) {
      clearTimeout(tokenRefreshTimeoutRef.current);
      tokenRefreshTimeoutRef.current = null;
    }
  }, []);

  const clearFirebaseNullGraceTimer = useCallback(() => {
    if (firebaseNullGraceTimeoutRef.current) {
      clearTimeout(firebaseNullGraceTimeoutRef.current);
      firebaseNullGraceTimeoutRef.current = null;
    }
  }, []);

  const clearLocalAuthSession = useCallback(async (reason: string) => {
    console.warn('[AuthContext] Clearing local auth session:', reason);
    clearTokenRefreshTimer();
    clearFirebaseNullGraceTimer();
    await removeAuthToken();
    currentUserRef.current = null;
    wasAuthenticatedRef.current = false;
    setFirebaseUser(null);
    await setUser(null);
    setIsAuthenticated(false);
    setUserContext(null);
  }, [clearTokenRefreshTimer, clearFirebaseNullGraceTimer, setUser, setUserContext]);

  useEffect(() => {
    setAuthSessionExpiredHandler(() => clearLocalAuthSession('API token refresh failed'));
    return () => setAuthSessionExpiredHandler(null);
  }, [clearLocalAuthSession]);

  /**
   * Fetches the current Firebase ID token, stores it, then schedules a proactive refresh
   * 2 minutes before expiry so API calls never hit an expired token.
   */
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

      // Refresh 2 minutes early; floor at 30 s to avoid tight loops on near-expired tokens.
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
        // iosClientId intentionally omitted — GoogleService-Info.plist takes precedence to
        // prevent client ID mismatch crashes on iOS.
      });
    }
  }, []);

  // Warm up Chrome Custom Tabs on Android so the OAuth sheet opens instantly.
  useEffect(() => {
    if (Platform.OS === 'android') {
      WebBrowser.warmUpAsync().catch(() => {});
      return () => {
        WebBrowser.coolDownAsync().catch(() => {});
      };
    }
  }, []);

  /**
   * Exchanges a Firebase ID token for a Wayfarian backend session and hydrates the user state.
   *
   * Uses a serialisation ref (`syncInFlightRef`) to prevent concurrent calls from racing —
   * the second caller awaits the first's promise instead of issuing a duplicate request.
   * Sets `isAuthenticated` optimistically before the backend responds so navigation is instant.
   */
  const syncUserData = useCallback(async (firebaseUser: FirebaseUser) => {
    if (syncInFlightRef.current) {
      console.log('[AuthContext] syncUserData: waiting for in-flight sync');
      await syncInFlightRef.current;
      return;
    }

    // Create and register the promise synchronously before any await to close the race window.
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

      const idToken = await firebaseUser.getIdToken();

      // Store the token in the background — api.ts caches it in memory so subsequent
      // requests can use it immediately before the async write finishes.
      setAuthToken(idToken).catch((err) =>
        console.warn('[AuthContext] Background token storage failed:', err)
      );

      // Optimistic auth so the app navigates to the home screen while the backend syncs.
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
          backendUser = await attemptFetchCurrentUser();

          if (!backendUser && currentUserRef.current) {
            backendUser = currentUserRef.current;
          }

          if (!backendUser) {
            console.warn('[AuthContext] Backend unreachable, preserving Firebase session');
            scheduleTokenRefresh(firebaseUser).catch(() => {});
            return;
          }
        } else {
          setIsAuthenticated(false);
          throw error;
        }
      }

      if (!backendUser) {
        backendUser = await attemptFetchCurrentUser();
      }

      if (!backendUser) {
        setIsAuthenticated(false);
        throw new Error('Unable to load Wayfarian account details.');
      }

      let srvUser = backendUser;

      // Auto-correct the generic "Wayfarian User" placeholder that the backend assigns to
      // OAuth sign-ins when Firebase hasn't yet propagated the display name.
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
      console.log('[AuthContext] Backend sync complete');
      setUserContext(srvUser);

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

      if (isRecoverable) {
        console.warn('[AuthContext] Backend sync failed, preserving Firebase session');
        setIsAuthenticated(true);
        if (existingUser) {
          setUserContext(existingUser);
        }
        return;
      }

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
      resolveSync!();
      syncInFlightRef.current = null;
    }
  }, [setUserContext, scheduleTokenRefresh, clearTokenRefreshTimer]);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  // Load onboarding and profile-setup flags before Firebase restores its session so the
  // router has correct state from the very first render.
  useEffect(() => {
    let mounted = true;

    const initializeAuthState = async () => {
      try {
        if (__DEV__) console.log('[AuthContext] Loading onboarding state from AsyncStorage...');
        const completed = await ReactNativeAsyncStorage.getItem(ONBOARDING_KEY);
        if (__DEV__) console.log('[AuthContext] Onboarding flag retrieved:', completed);

        const profileSetupCompleted = await ReactNativeAsyncStorage.getItem(PROFILE_SETUP_KEY);
        if (__DEV__) console.log('[AuthContext] Profile setup flag retrieved:', profileSetupCompleted);

        const cachedUserJson = await ReactNativeAsyncStorage.getItem(USER_DATA_KEY);

        if (mounted) {
          setHasCompletedOnboarding(completed === 'true');
          // Treat anything other than the explicit 'false' string as complete (existing users).
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

  // Auto-complete onboarding for users who are already authenticated but have no flag stored
  // (covers accounts created before the flag was introduced).
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

  // Primary auth state listener — fires after Firebase restores its persisted session.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          clearFirebaseNullGraceTimer();
          setFirebaseUser(firebaseUser);
          firstAuthResolvedRef.current = true;
          wasAuthenticatedRef.current = true;
          try {
            await syncUserData(firebaseUser);
          } catch (syncError: any) {
            const isRecoverable = syncError?.status === 429 || /Too many requests|Network request failed|Failed to fetch/i.test(syncError?.message);
            if (isRecoverable && currentUserRef.current) {
              setIsAuthenticated(true);
            } else {
              throw syncError;
            }
          }
        } else {
          // Race condition: Firebase fires null on cold start BEFORE the async
          // initializeAuthState effect has loaded the cached user from AsyncStorage.
          // The three-way guard below prevents wiping a valid session prematurely:
          //   1. currentUserRef — populated by initializeAuthState once cached user loads
          //   2. wasAuthenticatedRef — synchronously seeded from MMKV at module init
          //   3. firstAuthResolvedRef — skips only the very first null, not real sign-outs
          const mayStillBeRestoring = wasAuthenticatedRef.current && !firstAuthResolvedRef.current;
          if (mayStillBeRestoring) {
            if (__DEV__) console.log('[AuthContext] Firebase null before cached user loaded, preserving MMKV auth state');
            setFirebaseUser(null);
            clearFirebaseNullGraceTimer();
            firebaseNullGraceTimeoutRef.current = setTimeout(() => {
              firebaseNullGraceTimeoutRef.current = null;
              if (!auth.currentUser) {
                clearLocalAuthSession('Firebase session unavailable after restore').catch((error) => {
                  console.warn('[AuthContext] Delayed session clear failed:', error);
                });
              }
            }, 1500);
          } else {
            await clearLocalAuthSession('Firebase auth state is signed out');
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
  }, [setUserContext, syncUserData, clearTokenRefreshTimer, clearFirebaseNullGraceTimer, clearLocalAuthSession]);

  // Secondary listener for token rotation — schedules a proactive refresh whenever Firebase
  // issues a new ID token (e.g. after a force-refresh or sign-in).
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

  /** Sign in with email and password via Firebase, then sync backend session. */
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

  /**
   * Create a new Firebase account, set the display name, flag the session as a new sign-up
   * so the profile-setup screen is shown, then sync the backend.
   */
  const register = async (email: string, password: string, displayName: string) => {
    try {
      setLoading(true);
      console.log('Starting registration process...');

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Firebase user created');

      await updateProfile(userCredential.user, {
        displayName,
      });
      console.log('Firebase profile updated');

      setIsNewSignUp(true);
      setHasCompletedProfileSetup(false);
      await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'false');

      await syncUserData(userCredential.user);
      console.log('Registration completed successfully');

    } catch (error: any) {
      console.error('Registration error:', error);

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

  /**
   * Sign in with Google.
   *
   * Uses three different strategies depending on the runtime:
   * - Web: Firebase `signInWithPopup`.
   * - Expo Go: `expo-auth-session` (web proxy flow).
   * - Native build: `@react-native-google-signin/google-signin`.
   */
  const loginWithGoogle = async () => {
    try {
      setLoading(true);

      if (!GOOGLE_WEB_CLIENT_ID) {
        throw new Error('Google Sign-In is not configured. Please add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.');
      }

      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');

        const result = await signInWithPopup(auth, provider);
        await syncUserData(result.user);
        return;
      }

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

      // hasPlayServices is Android-only — skip on iOS to avoid a crash.
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

      // User cancelled the sheet — not an error worth surfacing.
      if (error.code === 12501 || error.code === '-5' || error.message?.includes('SIGN_IN_CANCELLED')) {
        return;
      }

      let errorMessage = error?.message || 'Google sign-in failed. Please try again.';

      // Huawei / HMS devices don't ship Google Play Services.
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

  /**
   * Sign in with Apple (iOS only).
   *
   * Generates a cryptographically random nonce, SHA-256 hashes it as HEX (not base64),
   * and passes the raw nonce to Firebase so it can verify the Apple identity token.
   */
  const loginWithApple = async () => {
    try {
      setLoading(true);

      if (Platform.OS !== 'ios') {
        throw new Error('Apple Sign-In is only available on iOS devices.');
      }

      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple Sign-In is not available on this device.');
      }

      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const nonce = Buffer.from(randomBytes)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
        .substring(0, 32);

      // Firebase requires HEX encoding for the hashed nonce when verifying Apple tokens.
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
        { encoding: Crypto.CryptoEncoding.HEX }
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const { identityToken } = credential;

      if (!identityToken) {
        throw new Error('Apple Sign-In failed: No identity token received.');
      }

      const provider = new OAuthProvider('apple.com');
      const appleCredential = provider.credential({
        idToken: identityToken,
        rawNonce: nonce,
      });

      const userCredential = await signInWithCredential(auth, appleCredential);

      const isNewUser = (userCredential as any)._tokenResponse?.isNewUser ||
        (userCredential.user.metadata.creationTime === userCredential.user.metadata.lastSignInTime);
      if (isNewUser) {
        setIsNewSignUp(true);
        setHasCompletedProfileSetup(false);
        await ReactNativeAsyncStorage.setItem(PROFILE_SETUP_KEY, 'false');
      }

      await syncUserData(userCredential.user);
    } catch (error: any) {
      console.error('Apple login error:', error);
      // Log codes explicitly — Apple error objects are frequently opaque.
      if (error.code) console.error('Apple Error Code:', error.code);
      if (error.message) console.error('Apple Error Message:', error.message);

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

  /**
   * Sign out from Firebase, Google (if applicable), and the Wayfarian backend.
   * Local state is always cleared even when server-side logout fails.
   */
  const logout = async () => {
    setLoading(true);
    try {
      // Best-effort server logout — local cleanup must not be blocked on a failing request.
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
      clearTokenRefreshTimer();
      // Clear currentUserRef BEFORE setUser so the onAuthStateChanged null callback doesn't
      // mistake the stale ref for a cached user and skip the sign-out path.
      currentUserRef.current = null;
      // Reset the MMKV guard so the next cold start correctly starts unauthenticated.
      wasAuthenticatedRef.current = false;
      setUser(null);
      setFirebaseUser(null);
      setIsAuthenticated(false);
      setUserContext(null);
      try { await removeAuthToken(); } catch (e) { console.warn('Failed to remove auth token during logout:', e); }
      setLoading(false);
    }
  };

  /**
   * Update the in-memory user without a full backend round-trip when a partial update is
   * provided. Falls back to a full `syncUserData` when called with no arguments.
   */
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

  /** Persist the onboarding completion flag and update component state. */
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

  /** Mark profile setup as complete after a new user finishes the profile-setup screen. */
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

  /**
   * Send a Firebase password-reset email.
   * Silently succeeds when the email doesn't match any account to prevent user enumeration.
   */
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
        // Silently succeed to prevent account enumeration via the reset flow.
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

  /**
   * Delete the account from both the Wayfarian backend and Firebase Auth,
   * then clear all local session state.
   *
   * Backend deletion happens first so that if Firebase deletion requires re-authentication,
   * the backend data is already gone and the user can retry without a partial-delete state.
   */
  const deleteAccount = async () => {
    try {
      setLoading(true);

      try {
        await authAPI.deleteAccount();
      } catch (backendError: any) {
        if (backendError?.body?.groupsWithMembers) {
          throw new Error(backendError.message || 'You must transfer ownership or delete groups before deleting your account.');
        }
        throw backendError;
      }

      if (firebaseUser) {
        try {
          await firebaseUser.delete();
        } catch (firebaseError: any) {
          if (firebaseError.code === 'auth/requires-recent-login') {
            // Backend data is already gone; the user must re-authenticate to remove the Firebase
            // account, but we can't block them here. Inform them and let it surface naturally.
            console.warn('Firebase user deletion requires recent login - backend data deleted but Firebase auth remains');
            throw new Error('Please sign in again and retry to complete account deletion.');
          }
          console.warn('Firebase user deletion failed (backend already deleted):', firebaseError);
        }
      }

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

      clearTokenRefreshTimer();
      // Clear currentUserRef BEFORE setUser so the onAuthStateChanged null callback correctly
      // treats this as a genuine sign-out rather than a stale-session preservation case.
      currentUserRef.current = null;
      wasAuthenticatedRef.current = false;
      setUser(null);
      setFirebaseUser(null);
      setIsAuthenticated(false);
      setUserContext(null);

      // Wipe all cached session data so no stale session can be restored on next launch.
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
