// app/components/ScreenHeader.tsx
// The back button and big title the Settings-style screens open with.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './dw/Icon';
import { F, shadow, useDW } from '../constants/design';

export default function ScreenHeader({ title }: { title: string }) {
  const d = useDW();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: Math.max(56, insets.top + 8) }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
      >
        <Icon name="back" size={20} color={d.ink} stroke={2} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: d.ink }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: F.black, fontSize: 28, letterSpacing: -0.6 },
});
