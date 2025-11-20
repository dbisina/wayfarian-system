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
