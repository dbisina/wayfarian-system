import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AMBER, DWTheme, F, INK, shadow, useDW } from '../../constants/design';
import Icon, { IconName } from './Icon';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  map: { label: 'Map', icon: 'map' },
  log: { label: 'Log', icon: 'log' },
  leaderboard: { label: 'Ranks', icon: 'trophy' },
};

interface Props {
  active: string; // 'index' | 'map' | 'log' | 'leaderboard'
  onNavigate: (name: string) => void;
  open: boolean;
  onCenter: () => void;
}

/** Floating 5-slot nav with the raised amber centre button (dark close button when the ride menu is open). */
export default function DWTabBar({ active, onNavigate, open, onCenter }: Props) {
  const t = useDW();
  const insets = useSafeAreaInsets();
  const left = ['index', 'map'];
  const right = ['log', 'leaderboard'];

  const renderItem = (name: string) => {
    const meta = TABS[name];
    const focused = active === name && !open;
    const go = () => {
      Haptics.selectionAsync().catch(() => {});
      if (!focused) onNavigate(name);
    };
    return (
      <Pressable
        key={name}
        onPress={go}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        style={({ pressed }) => [styles.item, !focused && styles.itemIdle, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Icon name={meta.icon} color={focused ? t.ink : t.ink2} />
        <Text style={[styles.label, { color: focused ? t.ink : t.ink2, fontFamily: focused ? F.extra : F.bold }]}>
          {meta.label}
        </Text>
        {focused && <View style={styles.dot} />}
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        shadow(t, 8),
        { bottom: Math.max(20, insets.bottom), backgroundColor: t.surface, borderColor: t.line },
      ]}
    >
      {left.map(renderItem)}
      <View style={styles.centerSlot}>
        <View style={styles.centerAnchor} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onCenter();
          }}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close ride menu' : 'Start a ride'}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [
            styles.center,
            {
              backgroundColor: open ? t.ink : AMBER,
              borderColor: t.bg,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          {open ? <Icon name="close" size={24} color={AMBER} stroke={2.6} /> : <Icon name="nav" size={26} color={INK} fill />}
        </Pressable>
        </View>
      </View>
      {right.map(renderItem)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    zIndex: 40,
    left: 16,
    right: 16,
    height: 66,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8 },
  itemIdle: { paddingBottom: 15 },
  label: { fontSize: 11 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: AMBER },
  centerSlot: { flex: 1 },
  centerAnchor: { position: 'absolute', top: -19, left: 0, right: 0, alignItems: 'center' },
  center: {
    width: 70,
    height: 70,
    borderRadius: 26,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
