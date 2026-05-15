/**
 * Button with integrated loading state. While loading, the background animates
 * from a lightened (pale) version of the button colour to the full colour,
 * giving a subtle "filling" effect that communicates progress without a spinner
 * jumping in width.
 *
 * @prop onPress          - Tap handler.
 * @prop title            - Button label.
 * @prop loading          - Shows spinner and animates fill when true.
 * @prop disabled         - Disables interaction and dims the button.
 * @prop style            - Override container styles.
 * @prop textStyle        - Override label styles.
 * @prop backgroundColor  - Custom background colour (overrides variant default).
 * @prop textColor        - Custom label colour (overrides variant default).
 * @prop icon             - Optional leading icon node.
 * @prop variant          - 'primary' (orange) or 'secondary' (light grey).
 */

import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { PRIMARY_COLORS } from '../../constants/theme';

interface LoadingButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  backgroundColor?: string;
  textColor?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export default function LoadingButton({
  onPress,
  title,
  loading = false,
  disabled = false,
  style,
  textStyle,
  backgroundColor,
  textColor,
  icon,
  variant = 'primary',
}: LoadingButtonProps) {
  const fillAnimation = useRef(new Animated.Value(0)).current;
  const isDisabled = disabled || loading;

  const defaultBgColor = variant === 'primary' ? PRIMARY_COLORS.orange : '#E0E0E0';
  const defaultTextColor = variant === 'primary' ? PRIMARY_COLORS.white : PRIMARY_COLORS.black;

  const bgColor = backgroundColor || defaultBgColor;
  const txtColor = textColor || defaultTextColor;

  // Derive a lightened version of the background colour for the "empty" state
  // of the fill animation without adding a colour-manipulation dependency.
  const paleColor = React.useMemo(() => {
    if (bgColor.startsWith('#')) {
      const hex = bgColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgb(${Math.round(r + (255 - r) * 0.4)}, ${Math.round(g + (255 - g) * 0.4)}, ${Math.round(b + (255 - b) * 0.4)})`;
    }
    return bgColor;
  }, [bgColor]);

  useEffect(() => {
    if (loading) {
      Animated.timing(fillAnimation, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    } else {
      fillAnimation.setValue(0);
    }
  }, [loading, fillAnimation]);

  const animatedBgColor = fillAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [paleColor, bgColor],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <Animated.View style={[styles.button, { backgroundColor: animatedBgColor }, style]}>
          <View style={styles.content}>
            <ActivityIndicator color={txtColor} size="small" />
          </View>
        </Animated.View>
      ) : (
        <View style={[styles.button, { backgroundColor: isDisabled ? paleColor : bgColor }, isDisabled && styles.disabled, style]}>
          <View style={styles.content}>
            {icon}
            <Text style={[styles.text, { color: txtColor }, textStyle]}>
              {title}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
