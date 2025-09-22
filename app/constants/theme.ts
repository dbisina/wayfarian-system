/**
 * Color constants used throughout the Wayfarian app
 */

import { Platform } from 'react-native';

// Primary Colors
export const PRIMARY_COLORS = {
  orange: '#F9A825',
  darkGray: '#3E4751',
  lightGray: '#757575',
  black: '#000000',
  white: '#FFFFFF',
  background: '#F6F6F6',
  cardBackground: '#FFFFFF',
  transparent: 'transparent',
} as const;

// Tab Bar Colors
export const TAB_BAR_COLORS = {
  background: 'rgba(250, 250, 250, 0.6)',
  activeBackground: 'rgba(250, 250, 250, 0.6)',
  activeText: '#000000',
  inactiveText: '#757575',
  shadow: '#000000',
} as const;

// Shadow Colors
export const SHADOW_COLORS = {
  primary: '#000000',
  light: 'rgba(0, 0, 0, 0.1)',
  medium: 'rgba(0, 0, 0, 0.25)',
} as const;

// Status Colors
export const STATUS_COLORS = {
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
} as const;

// Legacy colors for compatibility
const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
