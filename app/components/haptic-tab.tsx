/**
 * Drop-in replacement for the default bottom-tab bar button that fires a light
 * haptic impact on press-in, giving the tab bar a native iOS-like feel on both
 * platforms.
 */

import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  const { ref, ...otherProps } = props;
  return (
    <Pressable
      {...otherProps}
      onPressIn={(ev) => {
        if (props.onPressIn) {
          props.onPressIn(ev);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    />
  );
}
