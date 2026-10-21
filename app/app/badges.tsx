// app/app/badges.tsx — badge cabinet. Data comes from the achievements API (useUserData).

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useUserData } from '../hooks/useUserData';
import Icon, { IconName } from '../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../constants/design';

const ICON_CYCLE: IconName[] = ['bolt', 'moon', 'route', 'sun', 'flame', 'globe', 'trophy'];
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

type Tier = { level: number; name?: string; unlocked?: boolean; target?: number; threshold?: number; requirement?: number };

const tierTarget = (t: Tier) => t.target ?? t.threshold ?? t.requirement;

export default function BadgesScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { achievements, refreshData } = useUserData();
  const [selId, setSelId] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const items = useMemo(
    () =>
      (achievements as any[]).map((a, i) => {
        const tiers: Tier[] = Array.isArray(a.tiers) ? [...a.tiers].sort((x, y) => x.level - y.level) : [];
        const earnedTiers = tiers.filter((t) => t.unlocked).length;
        const on = a.unlocked === true || earnedTiers > 0;
        return { a, tiers, earnedTiers, on, icon: ICON_CYCLE[i % ICON_CYCLE.length] };
      }),
    [achievements]
  );

  const selected = items.find((x) => x.a.id === selId) ?? items.find((x) => x.on) ?? items[0];
  const earned = items.filter((x) => x.on).length;

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={[styles.round, { backgroundColor: d.surface }]}
          >
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
          <Text style={[styles.h1, { color: d.ink }]}>Badges</Text>
          <Text style={[styles.mono, { color: d.ink }]}>
            {earned} / {items.length}
          </Text>
        </View>

        {selected && (
          <View style={styles.feature}>
            <View style={styles.featureRow}>
              <View style={styles.bigWrap}>
                <View
                  style={[
                    styles.bigDiamond,
                    selected.on
                      ? { backgroundColor: AMBER, shadowColor: AMBER }
                      : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: d.ink2 },
                  ]}
                >
                  <View style={{ transform: [{ rotate: '-45deg' }] }}>
                    <Icon name={selected.icon} size={32} color={selected.on ? INK : d.ink2} stroke={2} />
                  </View>
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.eyebrow, { color: d.ink2 }]}>
                  {selected.tiers.length
                    ? `Tier ${ROMAN[Math.max(1, selected.earnedTiers)] || selected.earnedTiers} of ${ROMAN[selected.tiers.length] || selected.tiers.length}`
                    : selected.on
                      ? 'Earned'
                      : 'Locked'}
                </Text>
                <Text style={[styles.title, { color: d.ink }]}>{selected.a.name}</Text>
                {selected.a.description ? (
                  <Text style={[styles.desc, { color: d.ink2 }]}>{selected.a.description}</Text>
                ) : null}
              </View>
            </View>

            {selected.tiers.length > 0 && (
              <View style={styles.tiers}>
                {selected.tiers.map((t) => (
                  <View key={t.level} style={{ flex: 1, gap: 6 }}>
                    <View style={[styles.track, { backgroundColor: d.dark ? '#2A2723' : '#E2DCCD' }]}>
                      <View style={{ width: t.unlocked ? '100%' : '0%', height: 6, backgroundColor: AMBER }} />
                    </View>
                    <View style={styles.tierLabels}>
                      <Text style={[styles.mono12, { color: t.unlocked ? d.ink : d.ink2 }]}>{ROMAN[t.level] || t.level}</Text>
                      <Text style={[styles.mono12, { color: t.unlocked ? d.ink : d.ink2 }]}>
                        {tierTarget(t) != null ? String(tierTarget(t)) : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.grid}>
          {items.map((x) => (
            <TouchableOpacity
              key={x.a.id}
              onPress={() => setSelId(x.a.id)}
              accessibilityRole="button"
              accessibilityLabel={`${x.a.name}, ${x.on ? 'earned' : 'locked'}`}
              style={styles.cell}
            >
              <View style={styles.cellIcon}>
                <View
                  style={[
                    styles.diamond,
                    x.on ? { backgroundColor: AMBER } : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: d.ink2 },
                    selected?.a.id === x.a.id && { shadowColor: d.ink, borderWidth: 2, borderColor: d.ink },
                  ]}
                >
                  <View style={{ transform: [{ rotate: '-45deg' }] }}>
                    <Icon name={x.icon} size={20} color={x.on ? INK : d.ink2} stroke={2} />
                  </View>
                </View>
              </View>
              <Text style={[styles.cellName, { color: x.on ? d.ink : d.ink2 }]} numberOfLines={1}>{x.a.name}</Text>
              <Text style={[styles.cellSub, { color: d.ink2 }]} numberOfLines={1}>
                {x.tiers.length ? `${ROMAN[x.earnedTiers] || x.earnedTiers} / ${ROMAN[x.tiers.length] || x.tiers.length}` : x.on ? 'Earned' : 'Locked'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 20 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { flex: 1, fontFamily: F.black, fontSize: 30, letterSpacing: -0.6 },
  mono: { fontFamily: F.monoBold, fontSize: 13 },
  feature: { paddingHorizontal: 20, marginTop: 28, gap: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  bigWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  bigDiamond: { width: 74, height: 74, borderRadius: 20, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12 },
  eyebrow: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1.7, textTransform: 'uppercase' },
  title: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  desc: { fontFamily: F.regular, fontSize: 14, lineHeight: 19 },
  tiers: { flexDirection: 'row', gap: 6 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  tierLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  mono12: { fontFamily: F.monoBold, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 24, rowGap: 4 },
  cell: { width: '33.333%', height: 112, alignItems: 'center', gap: 8 },
  cellIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  diamond: { width: 44, height: 44, borderRadius: 12, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  cellName: { fontFamily: F.extra, fontSize: 13 },
  cellSub: { fontFamily: F.monoSemi, fontSize: 11, marginTop: -6 },
});
