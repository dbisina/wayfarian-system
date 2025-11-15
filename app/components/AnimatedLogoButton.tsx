import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  ImageStyle,
} from 'react-native';

const LOGO_IMAGE = require('../assets/logo.png');

interface AnimatedLogoButtonProps {
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  size?: number;
  padding?: number;
}

const AnimatedLogoButton: React.FC<AnimatedLogoButtonProps> = ({
  containerStyle,
  imageStyle,
  size = 34,
  padding = 5,
}) => {
  const rotation = useRef(new Animated.Value(0)).current;

  const startAnimation = useCallback(() => {
    rotation.stopAnimation(() => {
      rotation.setValue(0);
      Animated.sequence([
        Animated.timing(rotation, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: 2,
          duration: 620,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: 3,
          duration: 520,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['0deg', '-50deg', '70deg', '0deg'],
  });

  const borderRadius = (size + padding * 2) / 2;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={startAnimation}
      style={[styles.container, { borderRadius, padding }, containerStyle]}
      accessibilityRole="button"
      accessibilityLabel="Wayfarian navigator"
    >
      <Animated.Image
        source={LOGO_IMAGE}
        resizeMode="contain"
        style={[
          {
            width: size,
            height: size,
            transform: [{ rotate }],
          },
          styles.logo,
          imageStyle,
        ]}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    backfaceVisibility: 'hidden',
  },
});

export default AnimatedLogoButton;
