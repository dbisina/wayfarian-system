/**
 * Design-system tokens for the Wayfarian app.
 *
 * - PRIMARY_COLORS  — brand palette used across components.
 * - TAB_BAR_COLORS  — bottom tab bar surface and text.
 * - SHADOW_COLORS   — reusable shadow colour values.
 * - STATUS_COLORS   — semantic state colours (success, warning, error, info).
 * - Colors          — legacy light/dark theme tokens kept for compatibility
 *                     with Expo's auto-generated templates.
 * - Fonts           — platform-correct font-family stacks via Platform.select
 *                     so iOS uses system fonts and Android/web fall back cleanly.
 */

import { Platform } from 'react-native';

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

export const TAB_BAR_COLORS = {
  background: 'rgba(250, 250, 250, 0.6)',
  activeBackground: 'rgba(250, 250, 250, 0.6)',
  activeText: '#000000',
  inactiveText: '#757575',
  shadow: '#000000',
} as const;

export const SHADOW_COLORS = {
  primary: '#000000',
  light: 'rgba(0, 0, 0, 0.1)',
  medium: 'rgba(0, 0, 0, 0.25)',
} as const;

export const STATUS_COLORS = {
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
} as const;

// Legacy tokens — kept for compatibility with Expo template code.
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
