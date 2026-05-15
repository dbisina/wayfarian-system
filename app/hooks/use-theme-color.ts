/**
 * Resolves a theme-aware color from the design token system.
 *
 * Precedence: per-instance `props` override → global `Colors[theme][colorName]`.
 * This lets individual components opt out of a token with a one-off value without
 * forking the token itself.
 *
 * @see https://docs.expo.dev/guides/color-schemes/
 *
 * @param props - Optional per-theme color overrides (`light` and/or `dark`).
 * @param colorName - Key from `Colors.light` and `Colors.dark` to fall back to.
 * @returns The resolved color string for the current system color scheme.
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
