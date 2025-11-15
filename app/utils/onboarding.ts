import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const ONBOARDING_KEY = 'hasCompletedOnboarding';

export const ONBOARDING_COMPLETE_EVENT = 'wayfarian.onboardingComplete';

export const markOnboardingComplete = async () => {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    DeviceEventEmitter.emit(ONBOARDING_COMPLETE_EVENT, true);
  } catch (error) {
    console.error('Failed to persist onboarding completion:', error);
  }
};

export const clearOnboardingComplete = async () => {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    DeviceEventEmitter.emit(ONBOARDING_COMPLETE_EVENT, false);
  } catch (error) {
    console.error('Failed to clear onboarding completion flag:', error);
  }
};
