/**
 * Wayfarian 2.0 design tokens. Mirrors the approved mockups exactly.
 * Amber + warm ink, light and dark following the system setting.
 */
import { useColorScheme } from 'react-native';
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AMBER = '#F5A524';
export const INK = '#1A1814';
export const CREAM = '#F4F1E9';
export const PAPER = '#FFFDF8';
export const GREEN_LIVE = '#4CD38F';

export const F = {
  regular: 'Overpass_400Regular',
  medium: 'Overpass_500Medium',
  semi: 'Overpass_600SemiBold',
  bold: 'Overpass_700Bold',
  extra: 'Overpass_800ExtraBold',
  black: 'Overpass_900Black',
  mono: 'OverpassMono_500Medium',
  monoSemi: 'OverpassMono_600SemiBold',
  monoBold: 'OverpassMono_700Bold',
} as const;

export interface DWTheme {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  line: string;
  line2: string;
  lane: string;
  panel: string;
  panelText: string;
  panelMuted: string;
  panelLine: string;
  amberTint: string;
  danger: string;
  ok: string;
  shadowColor: string;
  shadowOpacity: number;
}

export const LIGHT: DWTheme = {
  dark: false,
  bg: '#F4F1E9',
  surface: '#FFFDF8',
  surface2: '#EAE5D9',
  ink: '#1A1814',
  ink2: '#625C51',
  line: 'rgba(26,24,20,0.09)',
  line2: 'rgba(26,24,20,0.2)',
  lane: 'rgba(26,24,20,0.14)',
  panel: '#1C1A16',
  panelText: '#F4F1E9',
  panelMuted: '#A59E90',
  panelLine: 'rgba(244,241,233,0.1)',
  amberTint: 'rgba(245,165,36,0.16)',
  danger: '#B8322B',
  ok: '#1E7A4C',
  shadowColor: '#46320A',
  shadowOpacity: 0.28,
};

export const DARK: DWTheme = {
  dark: true,
  bg: '#11100E',
  surface: '#1C1A17',
  surface2: '#262420',
  ink: '#F2EEE5',
  ink2: '#A29B8D',
  line: 'rgba(242,238,229,0.08)',
  line2: 'rgba(242,238,229,0.2)',
  lane: 'rgba(242,238,229,0.14)',
  panel: '#23211D',
  panelText: '#F2EEE5',
  panelMuted: '#A29B8D',
  panelLine: 'rgba(242,238,229,0.08)',
  amberTint: 'rgba(245,165,36,0.12)',
  danger: '#FF8A7E',
  ok: '#4CD38F',
  shadowColor: '#000000',
  shadowOpacity: 0.6,
};

export type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'wayfarian_theme_pref';
let themePref: ThemePref = 'system';
const listeners = new Set<() => void>();

AsyncStorage.getItem(THEME_KEY)
  .then((v) => {
    if (v === 'light' || v === 'dark' || v === 'system') {
      themePref = v;
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

export function setThemePref(next: ThemePref) {
  themePref = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The user's saved theme choice: follow the phone, or force light / dark. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => themePref, () => 'system' as ThemePref);
}

/** Returns the active theme: the saved choice, or the system colour scheme. */
export function useDW(): DWTheme {
  const scheme = useColorScheme();
  const pref = useThemePref();
  const dark = pref === 'system' ? scheme === 'dark' : pref === 'dark';
  return dark ? DARK : LIGHT;
}

/** Soft card shadow matching the mockup box-shadow. */
export function shadow(t: DWTheme, depth = 12) {
  return {
    shadowColor: t.shadowColor,
    shadowOffset: { width: 0, height: depth },
    shadowOpacity: t.shadowOpacity,
    shadowRadius: depth * 1.6,
    elevation: Math.round(depth / 2),
  };
}
