import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

// Simple, lightweight skeleton block. Keep static to avoid perf issues.
export function Skeleton({ width, height, borderRadius = 8, style }: { width?: number | string; height?: number; borderRadius?: number; style?: ViewStyle; }) {
  return (
    <View style={[styles.block, { width, height, borderRadius }, style]} />
  );
}

export function SkeletonLine({ width = '100%', height = 12, style }: { width?: number | string; height?: number; style?: ViewStyle }) {
  return <Skeleton width={width} height={height} style={[style, { borderRadius: 6 }]} />;
}

export function SkeletonCircle({ size = 40, style }: { size?: number; style?: ViewStyle }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#E5E7EB', // Tailwind gray-200-ish
    overflow: 'hidden',
  },
});

export default Skeleton;
