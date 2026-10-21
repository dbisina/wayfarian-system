import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  color: string;
  corner?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Card with the clipped top-right corner (mockup: clip-path polygon cut of 22-24px).
 * Draws the fill as an SVG path so the corner is a true cut, not a mask.
 */
export default function ClipCard({ color, corner = 22, radius = 20, style, children }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const { w, h } = size;
  const r = radius;
  const d = w
    ? `M${r} 0 H${w - corner} L${w} ${corner} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`
    : '';
  return (
    <View style={style} onLayout={onLayout}>
      {w > 0 && (
        <Svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Path d={d} fill={color} />
        </Svg>
      )}
      {children}
    </View>
  );
}
