// app/utils/platform.ts
// Platform-specific utilities and helpers

import { Platform, Dimensions, PixelRatio, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isWeb = Platform.OS === 'web';

/**
 * Get platform-specific keyboard avoiding behavior
 */
export const getKeyboardBehavior = () => {
  return isIOS ? 'padding' : 'height';
};

/**
 * Get platform-specific keyboard vertical offset
 * @param defaultOffset - Default offset for iOS (default: 64)
 */
export const getKeyboardOffset = (defaultOffset: number = 64) => {
  return isIOS ? defaultOffset : 0;
};

/**
 * Get platform-specific haptic feedback
 */
export const triggerHaptic = async (type: 'light' | 'medium' | 'heavy' = 'medium') => {
  try {
    if (isWeb) return; // No haptics on web
    
    switch (type) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  } catch (error) {
    // Silently fail if haptics not available
    console.debug('Haptic feedback not available:', error);
  }
};

/**
 * Platform-specific shadow styles
 */
export const getPlatformShadow = (elevation: number = 4) => {
  if (isAndroid) {
    return {
      elevation,
    };
  }
  
  // iOS shadows
  const shadowOpacity = Math.min(elevation / 24, 0.3);
  const shadowRadius = elevation * 0.8;
  
  return {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: Math.max(1, elevation / 2),
    },
    shadowOpacity,
    shadowRadius,
  };
};

/**
 * Get platform-specific status bar height approximation
 */
export const getStatusBarHeight = () => {
  if (isAndroid) return 24;
  if (isIOS) return 44; // Can be 20 or 44 depending on device
  return 0;
};

/**
 * Check if device has notch (iPhone X and newer)
 */
export const hasNotch = () => {
  if (!isIOS) return false;
  
  const dim = Dimensions.get('window');
  
  // iPhone X, XS, 11 Pro, 12, 13, 14, etc. have height >= 812
  return dim.height >= 812 || dim.width >= 812;
};

/**
 * Platform-specific font scaling
 */
export const getScaledFontSize = (size: number) => {
  // On Android, system font scaling can make text too large
  // Add a cap to prevent layout breaking
  if (isAndroid) {
    const fontScale = PixelRatio.getFontScale();
    
    // Cap font scaling at 1.3x on Android
    if (fontScale > 1.3) {
      return size * 1.3;
    }
    return size * fontScale;
  }
  
  return size;
};

/**
 * Get platform-specific alert implementation
 * iOS: Native alert
 * Android: Can use native or custom modal
 * Web: Browser alert
 */
export const showAlert = (title: string, message: string, buttons?: any[]) => {
  if (isWeb) {
    // Simple browser alert for web
    window.alert(`${title}\n\n${message}`);
    if (buttons && buttons[0] && buttons[0].onPress) {
      buttons[0].onPress();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

/**
 * Platform-specific image picker options
 */
export const getImagePickerOptions = () => {
  return {
    mediaTypes: 'Images' as any,
    allowsEditing: true,
    aspect: isAndroid ? [1, 1] : [4, 3], // Android prefers square, iOS more flexible
    quality: isAndroid ? 0.8 : 0.9, // Android: compress more to reduce upload size
  };
};

/**
 * Platform-specific map provider
 */
export const getMapProvider = () => {
  // Android must use PROVIDER_GOOGLE, iOS uses Apple Maps by default
  return isAndroid ? 'google' : undefined;
};

/**
 * Check if running in Expo Go
 */
export const isExpoGo = () => {
  return Constants.appOwnership === 'expo';
};

/**
 * Get platform-specific safe area insets
 */
export const getSafeAreaInsets = () => {
  // Default safe area values
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;
  
  if (isIOS) {
    top = hasNotch() ? 44 : 20;
    bottom = hasNotch() ? 34 : 0;
  } else if (isAndroid) {
    top = 24;
    bottom = 0;
  }
  
  return { top, bottom, left, right };
};

export default {
  isIOS,
  isAndroid,
  isWeb,
  getKeyboardBehavior,
  getKeyboardOffset,
  triggerHaptic,
  getPlatformShadow,
  getStatusBarHeight,
  hasNotch,
  getScaledFontSize,
  showAlert,
  getImagePickerOptions,
  getMapProvider,
  isExpoGo,
  getSafeAreaInsets,
};
