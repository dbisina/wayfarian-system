import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { F, useDW } from '../../constants/design';

export const GoogleG = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
    <Path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
    <Path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" fill="#FBBC05" />
    <Path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" fill="#EA4335" />
  </Svg>
);

export const AppleMark = ({ color }: { color: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
    <Path d="M16.4 12.6c0-2.4 2-3.5 2-3.6a4.3 4.3 0 0 0-3.4-1.8c-1.4-.2-2.8.8-3.5.8s-1.9-.8-3.1-.8a4.6 4.6 0 0 0-3.9 2.4c-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 2.9 2.4s1.6-.8 3-.8 1.8.8 3 .7c1.3 0 2.1-1.1 2.8-2.3a10 10 0 0 0 1.3-2.6 3.9 3.9 0 0 1-2.3-3.9zM14.1 5.5A4 4 0 0 0 15 2.5a4.1 4.1 0 0 0-2.7 1.4 3.8 3.8 0 0 0-1 2.9 3.4 3.4 0 0 0 2.8-1.3z" />
  </Svg>
);

/** Google + Apple pair used on login and register. */
export function SocialRow({ onGoogle, onApple, disabled }: { onGoogle: () => void; onApple: () => void; disabled?: boolean }) {
  const d = useDW();
  const btn = [styles.social, { borderColor: d.line2, opacity: disabled ? 0.6 : 1 }];
  return (
    <View style={styles.socialRow}>
      <TouchableOpacity style={btn} onPress={onGoogle} disabled={disabled} accessibilityRole="button">
        <GoogleG />
        <Text style={[styles.socialText, { color: d.ink }]}>Google</Text>
      </TouchableOpacity>
      <TouchableOpacity style={btn} onPress={onApple} disabled={disabled} accessibilityRole="button">
        <AppleMark color={d.ink} />
        <Text style={[styles.socialText, { color: d.ink }]}>Apple</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Labelled rounded input from the auth boards. */
export function Field({
  label,
  error,
  right,
  ...input
}: TextInputProps & { label: string; error?: string; right?: React.ReactNode }) {
  const d = useDW();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: d.ink }]}>{label}</Text>
        {right}
      </View>
      <TextInput
        placeholderTextColor={d.ink2}
        accessibilityLabel={label}
        {...input}
        style={[
          styles.input,
          { backgroundColor: d.surface, color: d.ink, borderColor: error ? d.danger : d.line2 },
          input.style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: d.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  socialRow: { flexDirection: 'row', gap: 8 },
  social: { flex: 1, height: 50, borderRadius: 25, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  socialText: { fontFamily: F.extra, fontSize: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: F.extra, fontSize: 13 },
  input: { height: 50, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, fontFamily: F.regular, fontSize: 16 },
  error: { fontFamily: F.bold, fontSize: 12 },
});
