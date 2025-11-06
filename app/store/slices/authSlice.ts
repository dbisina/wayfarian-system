// app/store/slices/authSlice.ts
// Authentication state management

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface User {
  id: string;
  username: string;
  email: string;
  profilePicture?: string;
  totalDistance?: number;
  totalJourneys?: number;
}

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
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.error = null;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
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
