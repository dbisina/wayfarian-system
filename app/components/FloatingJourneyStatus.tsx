// app/components/FloatingJourneyStatus.tsx
// The pill shown over the tabs while a ride is being recorded: time, distance and speed. It reads
// the v2 recorder, so it appears when you leave the ride screen and disappears the moment the ride
// ends. Tapping it returns to the ride. Amber and ink like the rest of the app, no red.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { useLiveRide } from '../v2/hooks';
import { formatDistance } from '../v2/format';

const hms = (s: number) => {
  const p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};

export default function FloatingJourneyStatus() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const live = useLiveRide();
  const [now, setNow] = useState(Date.now());

  const active = !!live && live.status !== 'ENDED';
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!live || !active) return null;

  const paused = live.status === 'PAUSED';
  const kmh = Math.round(Math.max(0, live.lastFix?.speedMps ?? 0) * 3.6);
  const elapsed = Math.max(0, Math.round((now - live.startedAt) / 1000));
  const bg = d.dark ? '#2A2723' : INK;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(0, insets.bottom - 20) + 104 }]}>
      <TouchableOpacity
        onPress={() => router.push('/ride' as never)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Ride paused. Open ride' : 'Ride recording. Open ride'}
        style={[styles.pill, shadow(d, 8), { backgroundColor: bg }]}
      >
        <View style={[styles.dot, { backgroundColor: paused ? '#A29B8D' : AMBER }]} />
        <Text style={styles.time}>{hms(elapsed)}</Text>
        <View style={styles.divider} />
        <Text style={styles.stat}>{formatDistance(live.distanceM)}</Text>
        <View style={styles.divider} />
        <Text style={styles.stat}>{paused ? 'Paused' : `${kmh} km/h`}</Text>
        <Icon name="chevron" size={16} color={AMBER} stroke={2.4} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2000 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 28, height: 48, paddingHorizontal: 16 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  time: { fontFamily: F.monoBold, fontSize: 15, color: '#F2EEE5' },
  stat: { fontFamily: F.monoSemi, fontSize: 13, color: '#C9C2B3' },
  divider: { width: 1, height: 14, backgroundColor: 'rgba(242,238,229,0.2)' },
});
