// app/app/PastJourneysScreen.tsx
// "Your journeys": everything you have ridden, newest first, opened from "See all" on Home. A
// featured latest ride, then months with a two-column grid. Reads the v2 ride list, so it works
// from the phone's cache when offline.

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { useV2Rides, useV2Summary } from '../v2/hooks';
import { detailRouteFor } from '../v2/ids';
import { formatDistance, formatDuration, formatSpeed } from '../v2/format';

type Filter = 'all' | 'solo' | 'group';

const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
const monthKey = (iso: string) => {
  const dt = new Date(iso);
  return `${dt.getFullYear()}-${dt.getMonth()}`;
};
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'long', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export default function PastJourneysScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const rides = useV2Rides();
  const summary = useV2Summary();
  const [filter, setFilter] = useState<Filter>('all');

  const all = useMemo(
    () => (rides.data?.pages.flatMap((p: any) => p.items) ?? []).filter((r: any) => r.status === 'FINALIZED' && r.distanceM >= 100),
    [rides.data]
  );
  const counts = useMemo(
    () => ({ all: all.length, solo: all.filter((r: any) => !r.groupRideId).length, group: all.filter((r: any) => !!r.groupRideId).length }),
    [all]
  );
  const shown = useMemo(
    () => all.filter((r: any) => (filter === 'all' ? true : filter === 'group' ? !!r.groupRideId : !r.groupRideId)),
    [all, filter]
  );
  const latest = shown[0];
  const months = useMemo(() => {
    const groups: { key: string; label: string; items: any[] }[] = [];
    for (const r of shown.slice(1)) {
      const k = monthKey(r.startedAt);
      const g = groups[groups.length - 1];
      if (g && g.key === k) g.items.push(r);
      else groups.push({ key: k, label: monthLabel(r.startedAt), items: [r] });
    }
    return groups;
  }, [shown]);

  const s = summary.data;
  const header = s ? `${s.rides} rides · ${Math.round(s.distanceM / 1000).toLocaleString('en-US')} km · ${Math.round(s.movingTimeS / 3600)}h` : '';
  const topInset = Math.max(56, insets.top + 8);
  const sh = shadow(d, 8);
  const open = (id: string) => router.push(detailRouteFor(id) as never);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height > contentSize.height - 400 && rides.hasNextPage && !rides.isFetchingNextPage) {
      rides.fetchNextPage();
    }
  };

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'solo', label: 'Solo' },
    { key: 'group', label: 'Group' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: insets.bottom + 40 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.round, { backgroundColor: d.surface }, sh]}>
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: d.ink }]}>Your journeys</Text>
            {!!header && <Text style={[styles.sub, { color: d.ink2 }]}>{header}</Text>}
          </View>
        </View>

        <View style={styles.chips} accessibilityRole="tablist">
          {chips.map((c) => {
            const on = filter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setFilter(c.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { backgroundColor: on ? d.ink : d.surface, borderColor: on ? d.ink : d.line }]}
              >
                <Text style={[styles.chipText, { color: on ? d.bg : d.ink }]}>{c.label}</Text>
                <Text style={[styles.chipCount, { color: on ? d.bg : d.ink }]}>{counts[c.key]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {rides.isLoading && <ActivityIndicator color={AMBER} style={{ marginTop: 40 }} />}
        {!rides.isLoading && shown.length === 0 && (
          <Text style={[styles.empty, { color: d.ink2 }]}>No rides here yet. Start one from the middle button.</Text>
        )}

        {latest && (
          <TouchableOpacity
            onPress={() => open(latest.id)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={`Latest ride: ${latest.title || 'Ride'}`}
            style={[styles.feature, sh]}
          >
            <View style={styles.glow} />
            <Svg width="100%" height={248} viewBox="0 0 358 248" style={StyleSheet.absoluteFill}>
              <Path d="M60 190 C96 150 120 160 150 118 S214 84 246 96 S312 70 328 34" fill="none" stroke="#FFFDF8" strokeOpacity={0.85} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 7" />
              <Path d="M330 24 l5 6 -5 6 -5 -6z" fill={AMBER} />
            </Svg>
            <View style={styles.latestChip}>
              <View style={styles.latestDot} />
              <Text style={styles.latestChipText}>Latest · {new Date(latest.startedAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle} numberOfLines={1}>{latest.title || 'Ride'}</Text>
              <Text style={styles.featureSub}>{latest.groupRideId ? 'Group ride' : 'Solo'}</Text>
            </View>
            <View style={styles.featureStats}>
              {[
                ['DISTANCE', formatDistance(latest.distanceM)],
                ['TIME', formatDuration(latest.movingTimeS)],
                ['TOP', formatSpeed(latest.topSpeedMps)],
              ].map(([label, value]) => (
                <View key={label} style={styles.featureStat}>
                  <Text style={styles.featureStatLabel}>{label}</Text>
                  <Text style={styles.featureStatValue} numberOfLines={1}>{value}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        )}

        {months.map((m) => (
          <View key={m.key} style={styles.month}>
            <View style={styles.monthHead}>
              <Text style={[styles.monthName, { color: d.ink }]}>{m.label}</Text>
              <Text style={[styles.monthMeta, { color: d.ink2 }]}>
                {m.items.length} {m.items.length === 1 ? 'ride' : 'rides'} · {Math.round(m.items.reduce((a, r) => a + r.distanceM, 0) / 1000)} km
              </Text>
            </View>
            <View style={styles.grid}>
              {m.items.map((r: any) => (
                <TouchableOpacity key={r.id} onPress={() => open(r.id)} activeOpacity={0.85} accessibilityRole="button" style={styles.card}>
                  <View style={[styles.thumb, { backgroundColor: d.surface2 }]}>
                    <Svg width="100%" height={116} viewBox="0 0 171 116" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
                      <Path d="M0 38h171M0 78h171M43 0v116M86 0v116M129 0v116" stroke={d.line} strokeWidth={1} />
                      <Path d="M28 92 C40 70 62 74 74 58 S104 30 120 40 S146 30 150 20" fill="none" stroke={AMBER} strokeWidth={4} strokeLinecap="round" />
                      <Path d="M150 14 l5 6 -5 6 -5 -6z" fill={AMBER} />
                    </Svg>
                    <View style={[styles.dayChip, { backgroundColor: d.surface }]}>
                      <Text style={[styles.dayText, { color: d.ink }]}>{day(r.startedAt)}</Text>
                    </View>
                    {!!r.groupRideId && (
                      <View style={styles.groupChip}><Text style={styles.groupChipText}>GROUP</Text></View>
                    )}
                  </View>
                  <View style={{ paddingHorizontal: 2 }}>
                    <Text style={[styles.cardTitle, { color: d.ink }]} numberOfLines={1}>{r.title || 'Ride'}</Text>
                    <Text style={[styles.cardMeta, { color: d.ink2 }]}>{formatDistance(r.distanceM)} · {formatDuration(r.movingTimeS)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {rides.isFetchingNextPage && <ActivityIndicator color={AMBER} style={{ marginTop: 20 }} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.black, fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  sub: { fontFamily: F.monoSemi, fontSize: 12 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 18 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: F.extra, fontSize: 13 },
  chipCount: { fontFamily: F.monoSemi, fontSize: 12, opacity: 0.7 },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },
  feature: { marginTop: 16, marginHorizontal: 16, height: 248, borderRadius: 28, overflow: 'hidden', backgroundColor: INK },
  glow: { position: 'absolute', right: -70, top: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(245,165,36,0.2)' },
  latestChip: { position: 'absolute', left: 14, top: 14, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(255,253,248,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  latestDot: { width: 7, height: 7, borderRadius: 2, backgroundColor: AMBER, transform: [{ rotate: '45deg' }] },
  latestChipText: { color: '#FFFDF8', fontFamily: F.extra, fontSize: 12 },
  featureText: { position: 'absolute', left: 16, right: 16, bottom: 76 },
  featureTitle: { color: '#FFFDF8', fontFamily: F.black, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  featureSub: { color: 'rgba(255,253,248,0.82)', fontFamily: F.regular, fontSize: 13 },
  featureStats: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  featureStat: { flex: 1, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,253,248,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', paddingHorizontal: 12 },
  featureStatLabel: { color: 'rgba(255,253,248,0.75)', fontFamily: F.extra, fontSize: 10, letterSpacing: 1 },
  featureStatValue: { color: '#FFFDF8', fontFamily: F.monoBold, fontSize: 15 },
  month: { marginTop: 22, paddingHorizontal: 16 },
  monthHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 12 },
  monthName: { fontFamily: F.black, fontSize: 20, letterSpacing: -0.2 },
  monthMeta: { fontFamily: F.monoBold, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14 },
  card: { width: '48%', gap: 8 },
  thumb: { height: 116, borderRadius: 20, overflow: 'hidden' },
  dayChip: { position: 'absolute', left: 8, top: 8, height: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center' },
  dayText: { fontFamily: F.extra, fontSize: 11 },
  groupChip: { position: 'absolute', left: 8, bottom: 8, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: AMBER, justifyContent: 'center' },
  groupChipText: { color: INK, fontFamily: F.black, fontSize: 9, letterSpacing: 0.8 },
  cardTitle: { fontFamily: F.extra, fontSize: 15 },
  cardMeta: { fontFamily: F.monoSemi, fontSize: 12 },
});
