import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** Redux slice state for UI preferences and transient modal state. */
interface UIState {
  theme: 'light' | 'dark' | 'auto';
  mapType: 'standard' | 'satellite' | 'hybrid';
  /** True while the user hasn't yet completed the onboarding flow. */
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
  /** Ephemeral state for a single active modal. Only one modal is shown at a time. */
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
    /** Persist the user's chosen colour theme. */
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'auto'>) => {
      state.theme = action.payload;
    },

    /** Switch the active map tile layer. */
    setMapType: (state, action: PayloadAction<'standard' | 'satellite' | 'hybrid'>) => {
      state.mapType = action.payload;
    },

    /** Mark the onboarding flow as finished. */
    setOnboardingComplete: (state) => {
      state.isOnboarding = false;
    },

    /** Patch one or more notification preferences (unspecified keys are unchanged). */
    setNotifications: (state, action: PayloadAction<Partial<UIState['notifications']>>) => {
      state.notifications = { ...state.notifications, ...action.payload };
    },

    /** Patch one or more user preferences (unspecified keys are unchanged). */
    setPreferences: (state, action: PayloadAction<Partial<UIState['preferences']>>) => {
      state.preferences = { ...state.preferences, ...action.payload };
    },

    /**
     * Open a modal by type, optionally passing data for it to render.
     * Only one modal is tracked at a time; calling this while one is open replaces it.
     */
    showModal: (state, action: PayloadAction<{ type: string; data?: any }>) => {
      state.modal = {
        visible: true,
        type: action.payload.type,
        data: action.payload.data,
      };
    },

    /** Close the active modal and reset its data. */
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
