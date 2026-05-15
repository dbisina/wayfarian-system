/**
 * Lightweight static skeleton-loading primitives.
 *
 * Intentionally static (no shimmer animation) to avoid layout thrash on list-heavy
 * screens where dozens of skeletons appear simultaneously.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue, StyleProp } from 'react-native';

/** Generic rectangular placeholder block. */
export function Skeleton({ width, height, borderRadius = 8, style }: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.block, { width, height, borderRadius }, style]} />
  );
}

/** Single-line text placeholder. */
export function SkeletonLine({ width = '100%', height = 12, style }: {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Skeleton width={width} height={height} style={[style, { borderRadius: 6 }]} />;
}

/** Circular avatar placeholder. */
export function SkeletonCircle({ size = 40, style }: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
});

export default Skeleton;
