import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Polygon, Line } from 'react-native-svg';
import { AMBER, INK } from '../../constants/design';

/**
 * The signature amber diagonal cut, main tab screens only.
 * Geometry is the mockup's 390x372 polygon: right edge ends at 52% height,
 * dashed lane line runs from (0,352) to (390,174).
 */
export default function Cut({ height = 372 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      <Svg width="100%" height={height} viewBox="0 0 390 372" preserveAspectRatio="none">
        <Polygon points="0,0 390,0 390,193.44 0,372" fill={AMBER} />
        <Line
          x1={0}
          y1={352}
          x2={390}
          y2={174}
          stroke={INK}
          strokeOpacity={0.22}
          strokeWidth={2}
          strokeDasharray="16 12"
        />
      </Svg>
    </View>
  );
}
