import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
  uri: string;
  /** Corner radius of the tile. Defaults to a soft 18. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Background behind the picture. White suits the usual product photos taken on a white backdrop. */
  background?: string;
}

/**
 * A vehicle picture in a clipped, rounded tile. Riders upload ordinary photos (often with a white
 * background), not cut-outs, so the picture is always kept inside its own rounded tile instead of
 * floating free where its square edges would overflow the card around it.
 */
export default function VehiclePhoto({ uri, radius = 18, style, background = '#FFFFFF' }: Props) {
  return (
    <View style={[styles.tile, { borderRadius: radius, backgroundColor: background }, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden' },
});
