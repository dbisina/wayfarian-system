import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** The Wayfarian logo (the same artwork as the app icon) in a rounded tile. */
export default function BrandMark({ size = 44, style }: Props) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Wayfarian"
      style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.34) }, style]}
    >
      <Image source={require('../../assets/icons/ios-light.png')} style={styles.img} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', backgroundColor: '#FFFFFF' },
  img: { width: '100%', height: '100%' },
});
