import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (props.onPressIn) {
          props.onPressIn(ev);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    />
  );
}
