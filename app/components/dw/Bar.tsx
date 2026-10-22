import React from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { AMBER, DWTheme } from '../../constants/design';

/** Amber progress bar with the dashed lane line running through the track. */
export default function Bar({ t, pct, height = 12 }: { t: DWTheme; pct: number; height?: number }) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <Svg width="100%" height={height} style={{ position: 'absolute' }}>
        <Line x1={0} x2="100%" y1={height / 2} y2={height / 2} stroke={t.lane} strokeWidth={2} strokeDasharray="10 8" />
      </Svg>
      <View style={{ width: `${p * 100}%`, height, borderRadius: height / 2, backgroundColor: AMBER }} />
    </View>
  );
}
