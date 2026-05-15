import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const ONBOARDING_KEY = 'hasCompletedOnboarding';

/** Event name emitted when the onboarding completion flag changes. */
export const ONBOARDING_COMPLETE_EVENT = 'wayfarian.onboardingComplete';

/**
 * Persists the onboarding completion flag and notifies all listeners.
 * Emits `ONBOARDING_COMPLETE_EVENT` with `true` on success.
 */
export const markOnboardingComplete = async () => {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    DeviceEventEmitter.emit(ONBOARDING_COMPLETE_EVENT, true);
  } catch (error) {
    console.error('Failed to persist onboarding completion:', error);
  }
};

/**
 * Clears the onboarding completion flag and notifies all listeners.
 * Emits `ONBOARDING_COMPLETE_EVENT` with `false` on success.
 * Intended for dev/testing use to reset the onboarding flow.
 */
export const clearOnboardingComplete = async () => {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    DeviceEventEmitter.emit(ONBOARDING_COMPLETE_EVENT, false);
  } catch (error) {
    console.error('Failed to clear onboarding completion flag:', error);
  }
};
