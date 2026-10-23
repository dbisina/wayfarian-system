import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { F, INK } from '../../constants/design';

type Size = 'lg' | 'md' | 'sm';

// Sizes from the design: the vehicle screen, the garage card and the profile card.
const SIZES: Record<Size, { w: number; h: number; font: number }> = {
  lg: { w: 96, h: 40, font: 13 },
  md: { w: 88, h: 36, font: 12 },
  sm: { w: 86, h: 32, font: 11 },
};

/** A number plate: cream plate, dark outline, the number in mono. Renders nothing without a plate. */
export default function PlateBadge({ plate, size = 'md' }: { plate?: string | null; size?: Size }) {
  if (!plate) return null;
  const s = SIZES[size];
  return (
    <View accessibilityRole="image" accessibilityLabel={`Plate ${plate}`} style={[styles.plate, { minWidth: s.w, height: s.h }]}>
      <Text style={[styles.text, { fontSize: s.font, lineHeight: s.font + 2 }]} numberOfLines={1}>{plate}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { borderRadius: 6, backgroundColor: '#F4F1E9', borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  text: { fontFamily: F.monoBold, color: INK, letterSpacing: 0.6 },
});
