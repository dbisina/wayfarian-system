import { Platform, Dimensions, PixelRatio, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isWeb = Platform.OS === 'web';

/**
 * Returns the correct `KeyboardAvoidingView` behavior for the current platform.
 * iOS needs `'padding'`; Android needs `'height'` to avoid double-shifting.
 */
export const getKeyboardBehavior = () => {
  return isIOS ? 'padding' : 'height';
};

/**
 * Returns the vertical offset for `KeyboardAvoidingView`.
 * Android ignores the offset entirely (returns 0) because the behavior differs.
 * @param defaultOffset - Offset in points applied on iOS (default: 64).
 */
export const getKeyboardOffset = (defaultOffset: number = 64) => {
  return isIOS ? defaultOffset : 0;
};

/**
 * Fires a haptic impact pulse. Silent no-op on web or when haptics are unavailable.
 * @param type - Impact intensity: `'light'`, `'medium'` (default), or `'heavy'`.
 */
export const triggerHaptic = async (type: 'light' | 'medium' | 'heavy' = 'medium') => {
  try {
    if (isWeb) return;

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
    console.debug('Haptic feedback not available:', error);
  }
};

/**
 * Returns a platform-appropriate shadow style object.
 * Android uses `elevation`; iOS uses the shadow* props — the two systems are
 * mutually exclusive, so a single object cannot satisfy both.
 * @param elevation - Conceptual elevation level (default: 4).
 */
export const getPlatformShadow = (elevation: number = 4) => {
  if (isAndroid) {
    return { elevation };
  }

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
 * Returns a rough status bar height approximation without requiring
 * `react-native-safe-area-context`. Prefer `useSafeAreaInsets` where possible.
 *
 * iOS value (44) covers notched iPhones; older models report 20 at runtime.
 */
export const getStatusBarHeight = () => {
  if (isAndroid) return 24;
  if (isIOS) return 44;
  return 0;
};

/**
 * Returns true when the device is likely a notched iPhone (X or newer).
 * Based on physical dimension thresholds rather than API because there is no
 * reliable first-party notch detection in React Native.
 */
export const hasNotch = () => {
  if (!isIOS) return false;

  const dim = Dimensions.get('window');
  return dim.height >= 812 || dim.width >= 812;
};

/**
 * Returns a font size capped at 1.3× system scale on Android.
 * Uncapped system scaling can exceed layout bounds on accessibility font sizes.
 * iOS handles its own scaling gracefully, so we pass through unchanged.
 * @param size - Base font size in points.
 */
export const getScaledFontSize = (size: number) => {
  if (isAndroid) {
    const fontScale = PixelRatio.getFontScale();
    if (fontScale > 1.3) {
      return size * 1.3;
    }
    return size * fontScale;
  }

  return size;
};

/**
 * Cross-platform alert wrapper.
 * Web uses `window.alert` (only the first button's `onPress` is invoked, if any),
 * native platforms delegate to `Alert.alert`.
 */
export const showAlert = (title: string, message: string, buttons?: any[]) => {
  if (isWeb) {
    window.alert(`${title}\n\n${message}`);
    if (buttons && buttons[0] && buttons[0].onPress) {
      buttons[0].onPress();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

/**
 * Returns image picker options tuned per platform.
 * Android prefers square crops and heavier compression to reduce upload sizes;
 * iOS allows a looser aspect ratio and lighter compression.
 */
export const getImagePickerOptions = () => {
  return {
    mediaTypes: 'Images' as any,
    allowsEditing: true,
    aspect: isAndroid ? [1, 1] : [4, 3],
    quality: isAndroid ? 0.8 : 0.9,
  };
};

/**
 * Returns the map provider string for `react-native-maps`.
 * Android requires `'google'`; iOS defaults to Apple Maps when `undefined`.
 */
export const getMapProvider = () => {
  return isAndroid ? 'google' : undefined;
};

/**
 * Returns true when the app is running inside Expo Go rather than a standalone build.
 * Used to conditionally disable features unavailable in the managed sandbox.
 */
export const isExpoGo = () => {
  return Constants.appOwnership === 'expo';
};

/**
 * Returns static safe area inset estimates without requiring
 * `react-native-safe-area-context`. Prefer `useSafeAreaInsets` hook for
 * accurate runtime values; use this only where a hook cannot be called.
 */
export const getSafeAreaInsets = () => {
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
