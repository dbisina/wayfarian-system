import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** Minimal user shape stored in Redux auth state (mirrors backend profile). */
interface User {
  id: string;
  username: string;
  email: string;
  profilePicture?: string;
  totalDistance?: number;
  totalJourneys?: number;
}

/** Redux slice state for authentication. */
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Persist a fully-loaded user and mark the session as authenticated. */
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.error = null;
    },

    /** Store the raw auth token (JWT / Firebase ID token). */
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },

    /** Clear all auth state on sign-out. */
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    },

    /** Toggle the loading flag during async auth operations. */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },

    /** Record an auth error and clear the loading flag. */
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },

    /** Dismiss any previously recorded auth error. */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Patch lifetime stats on the in-memory user without a full re-fetch.
     * `undefined` values are ignored so callers can update a single field.
     */
    updateUserStats: (state, action: PayloadAction<{ totalDistance?: number; totalJourneys?: number }>) => {
      if (state.user) {
        state.user.totalDistance = action.payload.totalDistance ?? state.user.totalDistance;
        state.user.totalJourneys = action.payload.totalJourneys ?? state.user.totalJourneys;
      }
    },
  },
});

export const { setUser, setToken, logout, setLoading, setError, clearError, updateUserStats } = authSlice.actions;
export default authSlice.reducer;
