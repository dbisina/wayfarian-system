import React, { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, StyleProp, View, ViewStyle } from 'react-native';

/**
 * Height of the on-screen keyboard (0 when hidden), on both platforms.
 *
 * Android 15 and Expo SDK 54 draw the app edge to edge, so the old "resize the window" behaviour no
 * longer happens and the keyboard simply covers whatever is at the bottom. Every screen therefore
 * shrinks itself by this height instead.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const glide = (ms?: number) => LayoutAnimation.configureNext(LayoutAnimation.create(ms && ms > 0 ? ms : 180, 'keyboard', 'opacity'));
    const show = Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (e) => {
      glide(e.duration);
      setHeight(Math.max(0, e.endCoordinates.height));
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      glide(e?.duration);
      setHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

/**
 * Wraps screen content so it ends where the keyboard begins. `iosOnly` is for screens shown as a
 * native iOS modal, which sit outside the app's root wrapper; on Android those are ordinary
 * screens that the root wrapper already covers.
 */
export default function KeyboardInset({ children, style, iosOnly }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; iosOnly?: boolean }) {
  const height = useKeyboardHeight();
  const apply = iosOnly ? Platform.OS === 'ios' : true;
  return <View style={[{ flex: 1, paddingBottom: apply ? height : 0 }, style]}>{children}</View>;
}
