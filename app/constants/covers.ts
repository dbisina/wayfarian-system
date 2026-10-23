// Cover photos from the design, bundled with the app. Used as the choices on New group and as the
// default cover for a group that has not uploaded its own.

import type { ImageSourcePropType } from 'react-native';

export interface CoverPreset {
  key: string;
  label: string;
  source: ImageSourcePropType;
}

export const COVER_PRESETS: CoverPreset[] = [
  { key: 'desert', label: 'Desert road', source: require('../assets/covers/desert.jpg') },
  { key: 'switchbacks', label: 'Switchbacks', source: require('../assets/covers/switchbacks.jpg') },
  { key: 'forest', label: 'Forest road', source: require('../assets/covers/forest.jpg') },
  { key: 'coast', label: 'Coast', source: require('../assets/covers/coast.jpg') },
  { key: 'safari', label: 'Safari', source: require('../assets/covers/safari.jpg') },
];

export const MOUNTAIN_COVER: ImageSourcePropType = require('../assets/covers/mountain.jpg');

/** A stable default cover for a group with no photo of its own, so the same group always looks the same. */
export function defaultCoverFor(seed: string): ImageSourcePropType {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_PRESETS[h % COVER_PRESETS.length].source;
}
