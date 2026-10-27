// app/components/GlassPill.tsx
// The frosted tag the design lays over photos: a blurred, darkened pill with a hairline edge.

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** How dark the glass is. The design uses 0.28-0.3 over photos. */
  tint?: number;
}

export default function GlassPill({ children, style, radius = 16, tint = 0.28 }: Props) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Android draws no real blur, so the tint carries the look there. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(26,24,20,${tint})`, borderRadius: radius, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' }]} />
      {children}
    </View>
  );
}
