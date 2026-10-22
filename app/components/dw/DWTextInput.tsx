import React, { forwardRef } from 'react';
import { Platform, StyleSheet, TextInput as RNTextInput, TextInputProps } from 'react-native';

/**
 * TextInput that does not clip its text on Android.
 *
 * With a custom font and a fixed height, Android adds its own font padding and positions the line
 * from the top, so the tops of letters get cut off (a typed "G" shows half). Here the text is
 * centred, the extra font padding is removed and the line height is set explicitly. iOS is
 * untouched. Multiline inputs keep their own padding and top alignment.
 */
const DWTextInput = forwardRef<RNTextInput, TextInputProps>(function DWTextInput({ style, multiline, ...rest }, ref) {
  let merged = style;
  if (Platform.OS === 'android') {
    const flat = StyleSheet.flatten(style) || {};
    const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
    const safe: Record<string, unknown> = { includeFontPadding: false };
    if (!multiline) {
      safe.textAlignVertical = 'center';
      if (flat.lineHeight == null) safe.lineHeight = Math.round(fontSize * 1.3);
      // A fixed-height field must not also have vertical padding eating the line.
      if (flat.height != null) { safe.paddingTop = 0; safe.paddingBottom = 0; }
    }
    merged = [style, safe] as TextInputProps['style'];
  }
  return <RNTextInput ref={ref} multiline={multiline} style={merged} {...rest} />;
});

export default DWTextInput;
