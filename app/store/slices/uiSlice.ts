// app/store/slices/uiSlice.ts
// UI state management

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  theme: 'light' | 'dark' | 'auto';
  mapType: 'standard' | 'satellite' | 'hybrid';
  isOnboarding: boolean;
  notifications: {
    enabled: boolean;
    sound: boolean;
    vibration: boolean;
  };
  preferences: {
    distanceUnit: 'km' | 'mi';
    speedUnit: 'kph' | 'mph';
    showMemberMarkers: boolean;
    autoStartTracking: boolean;
  };
  modal: {
    visible: boolean;
    type: string | null;
    data: any;
  };
}

const initialState: UIState = {
  theme: 'auto',
  mapType: 'standard',
  isOnboarding: true,
  notifications: {
    enabled: true,
    sound: true,
    vibration: true,
  },
  preferences: {
    distanceUnit: 'km',
    speedUnit: 'kph',
    showMemberMarkers: true,
    autoStartTracking: false,
  },
  modal: {
    visible: false,
    type: null,
    data: null,
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'auto'>) => {
      state.theme = action.payload;
    },
    
    setMapType: (state, action: PayloadAction<'standard' | 'satellite' | 'hybrid'>) => {
      state.mapType = action.payload;
    },
    
    setOnboardingComplete: (state) => {
      state.isOnboarding = false;
    },
    
    setNotifications: (state, action: PayloadAction<Partial<UIState['notifications']>>) => {
      state.notifications = { ...state.notifications, ...action.payload };
    },
    
    setPreferences: (state, action: PayloadAction<Partial<UIState['preferences']>>) => {
      state.preferences = { ...state.preferences, ...action.payload };
    },
    
    showModal: (state, action: PayloadAction<{ type: string; data?: any }>) => {
      state.modal = {
        visible: true,
        type: action.payload.type,
        data: action.payload.data,
      };
    },
    
    hideModal: (state) => {
      state.modal = {
        visible: false,
        type: null,
        data: null,
      };
    },
  },
});

export const {
  setTheme,
  setMapType,
  setOnboardingComplete,
  setNotifications,
  setPreferences,
  showModal,
  hideModal,
} = uiSlice.actions;

export default uiSlice.reducer;
