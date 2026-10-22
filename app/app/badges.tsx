// app/app/badges.tsx — badge cabinet. One tile per badge family; tap one to see its tiers and
// how far the next tier is. Progress comes from the server's badge progress (v2 summary).

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Icon from '../components/dw/Icon';
import { AMBER, F, useDW } from '../constants/design';
import { useV2Summary } from '../v2/hooks';
import { ICON_PATHS, buildFamilies, type BadgeFamily } from '../v2/badges';

export default function BadgesScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const summary = useV2Summary();
  const [selId, setSelId] = useState<string | null>(null);

  const families = useMemo(() => buildFamilies(summary.data?.badgeProgress ?? []), [summary.data]);
  const selected: BadgeFamily | undefined = families.find((f) => f.id === selId) ?? families.find((f) => f.earned) ?? families[0];
  const tiersEarned = families.reduce((n, f) => n + f.tiersEarned, 0);
  const tierTotal = families.reduce((n, f) => n + f.tierCount, 0);
  const tint = d.dark ? 'rgba(245,165,36,0.14)' : 'rgba(245,165,36,0.22)';
  const track = d.dark ? '#2A2723' : '#E2DCCD';

  const Glyph = ({ family, size, ink }: { family: BadgeFamily; size: number; ink: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICON_PATHS[family.icon]} />
    </Svg>
  );

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.round, { backgroundColor: d.surface }]}>
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
          <Text style={[styles.h1, { color: d.ink }]}>Badges</Text>
          <Text style={[styles.count, { color: d.ink }]}>{tiersEarned} / {tierTotal}</Text>
        </View>

        {summary.isLoading && <ActivityIndicator color={AMBER} style={{ marginTop: 40 }} />}

        {selected && (
          <View style={styles.feature}>
            <View style={styles.featureTop}>
              <View style={styles.featureBadgeWrap}>
                <View style={[styles.diamond, { backgroundColor: selected.earned ? AMBER : 'transparent', borderColor: selected.earned ? AMBER : d.ink2, borderStyle: selected.earned ? 'solid' : 'dashed', borderWidth: selected.earned ? 0 : 1.5 }]}>
                  <View style={{ transform: [{ rotate: '-45deg' }] }}>
                    <Glyph family={selected} size={32} ink={selected.earned ? '#1A1814' : d.ink2} />
                  </View>
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.eyebrow, { color: d.ink2 }]}>
                  {selected.tierCount > 1 ? `Tier ${selected.tiersEarned || 0} of ${selected.tierCount}` : selected.earned ? 'Earned' : 'Locked'}
                </Text>
                <Text style={[styles.featureName, { color: d.ink }]}>{selected.name}</Text>
                <Text style={[styles.blurb, { color: d.ink2 }]}>{selected.blurb}</Text>
              </View>
            </View>

            {selected.tierCount > 1 && (
              <View style={styles.tiers}>
                {selected.tiers.map((t) => (
                  <View key={t.id} style={{ flex: 1, gap: 6 }}>
                    <View style={[styles.bar, { backgroundColor: track }]}>
                      <View style={{ width: `${t.pct}%`, height: 6, backgroundColor: AMBER }} />
                    </View>
                    <View style={styles.tierLabels}>
                      <Text style={[styles.mono, { color: t.earned ? d.ink : d.ink2 }]}>{t.label}</Text>
                      <Text style={[styles.mono, { color: t.earned ? d.ink : d.ink2 }]}>{t.threshold.toLocaleString('en-US')}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {selected.nextLine && (
              <View style={[styles.note, { backgroundColor: tint }]}>
                <Text style={[styles.noteText, { color: d.ink }]}>{selected.nextLine}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.grid}>
          {families.map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setSelId(f.id)}
              accessibilityRole="button"
              accessibilityLabel={`${f.name}, ${f.earned ? 'earned' : 'locked'}, ${f.sub}`}
              style={styles.cell}
            >
              <View style={styles.cellBadge}>
                <View
                  style={[
                    styles.cellDiamond,
                    {
                      backgroundColor: f.earned ? AMBER : 'transparent',
                      borderColor: d.ink2,
                      borderWidth: f.earned ? 0 : 1.5,
                      borderStyle: f.earned ? 'solid' : 'dashed',
                    },
                    selected?.id === f.id && { shadowColor: d.ink, shadowOpacity: 0.9, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, outlineWidth: 0 },
                  ]}
                >
                  <View style={{ transform: [{ rotate: '-45deg' }] }}>
                    <Glyph family={f} size={20} ink={f.earned ? '#1A1814' : d.ink2} />
                  </View>
                </View>
              </View>
              <Text style={[styles.cellName, { color: f.earned ? d.ink : d.ink2 }]} numberOfLines={1}>{f.name}</Text>
              <Text style={[styles.cellSub, { color: d.ink2 }]} numberOfLines={1}>{f.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { flex: 1, fontFamily: F.black, fontSize: 30, letterSpacing: -0.6 },
  count: { fontFamily: F.monoBold, fontSize: 13, paddingRight: 4 },
  feature: { paddingHorizontal: 20, marginTop: 26, gap: 16 },
  featureTop: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  featureBadgeWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  diamond: { width: 74, height: 74, borderRadius: 20, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' },
  featureName: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  blurb: { fontFamily: F.regular, fontSize: 14, lineHeight: 19 },
  tiers: { flexDirection: 'row', gap: 6 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  tierLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: F.monoBold, fontSize: 12 },
  note: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  noteText: { fontFamily: F.extra, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 28 },
  cell: { width: '33.333%', height: 112, alignItems: 'center', gap: 6 },
  cellBadge: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  cellDiamond: { width: 44, height: 44, borderRadius: 12, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  cellName: { fontFamily: F.extra, fontSize: 13 },
  cellSub: { fontFamily: F.monoSemi, fontSize: 11, marginTop: -2 },
});
