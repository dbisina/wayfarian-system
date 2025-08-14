import React from 'react';
import {
  TouchableOpacity,
  Image,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface FloatingButtonProps {
  iconUri: string;
  style?: ViewStyle;
  size: number;
  borderRadius: number;
  padding: {
    horizontal: number;
    vertical: number;
  };
  onPress?: () => void;
}

const FloatingButton: React.FC<FloatingButtonProps> = ({
  iconUri,
  style,
  size,
  borderRadius,
  padding,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          paddingHorizontal: padding.horizontal,
          paddingVertical: padding.vertical,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: iconUri }}
        style={styles.icon}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: {
    width: 24,
    height: 24,
  },
});

export default FloatingButton;
