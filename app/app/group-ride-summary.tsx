// app/app/group-ride-summary.tsx
// Recap of a finished group ride: the crew's totals, a route, and the crew awards.

import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, INK, useDW } from '../constants/design';
import { useV2GroupRide, useV2GroupSummary } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { projectRoute } from '../v2/route';
import { crewAwards } from '../v2/awards';
import { initials } from '../v2/liveBoard';
import { formatDistance, formatDuration, formatSpeed } from '../v2/format';

export default function GroupRideSummaryScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useV2GroupRide(id);
  const summary = useV2GroupSummary(id);
  const s = summary.data;
  const g = group.data;

  // Draw your own ride's route (the server only shares a route with its owner).
  const myRideId: string | undefined = s?.riders.find((r: any) => r.userId === user?.id)?.rideId;
  const route = useQuery({
    queryKey: ['route', myRideId],
    queryFn: () => getRuntime().client.rideRoute(myRideId!, 600),
    enabled: !!myRideId,
    staleTime: Infinity,
  });
  const lines = useMemo(() => projectRoute(route.data?.points ?? []), [route.data]);
  const awards = useMemo(() => crewAwards(s?.riders ?? []), [s]);

  if (summary.isLoading || group.isLoading) {
    return <View style={[styles.center, { backgroundColor: INK }]}><ActivityIndicator color={AMBER} /></View>;
  }
  if (!s || !g) {
    return (
      <View style={[styles.center, { backgroundColor: INK }]}>
        <Text style={{ color: '#F2EEE5', fontFamily: F.medium }}>This group ride is not available.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: AMBER, fontFamily: F.bold, marginTop: 12 }}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  const tiles = [
    { label: 'Crew distance', value: formatDistance(s.totalDistanceM) },
    { label: 'Riders', value: String(s.riderCount) },
    { label: 'Time', value: s.durationS != null ? formatDuration(s.durationS) : '–' },
    { label: 'Top speed', value: formatSpeed(s.topSpeedMps) },
  ];
  const date = g.startedAt ? new Date(g.startedAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const share = () =>
    Share.share({ message: `${g.title}: ${s.riderCount} riders, ${formatDistance(s.totalDistanceM)} together on Wayfarian.` }).catch(() => {});

  return (
    <View style={[styles.root, { backgroundColor: INK }]}>
      <View style={styles.cover}>
        <Svg width="100%" height="100%" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet" style={StyleSheet.absoluteFill}>
          {lines.map((pts, i) => (
            <Polyline key={i} points={pts} fill="none" stroke={AMBER} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        <View style={[styles.top, { top: Math.max(56, insets.top + 8) }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.glass}>
            <Icon name="back" size={20} color="#FFFDF8" stroke={2} />
          </TouchableOpacity>
          <View style={[styles.glass, { width: undefined, paddingHorizontal: 14, flexDirection: 'row', gap: 8 }]}>
            <View style={styles.dot} />
            <Text style={styles.chip}>Group ride</Text>
          </View>
        </View>
        <View style={styles.tiles}>
          {tiles.map((t) => (
            <View key={t.label} style={styles.tile}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileValue}>{t.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.sheet, { backgroundColor: d.surface, paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: d.ink }]} numberOfLines={1}>{g.title}</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: d.ink2 }}>{date}</Text>
          </View>
          {s.crewXp > 0 && (
            <View style={[styles.xp, { backgroundColor: d.dark ? 'rgba(245,165,36,0.14)' : 'rgba(245,165,36,0.22)' }]}>
              <Text style={[styles.xpText, { color: d.ink }]}>+{s.crewXp.toLocaleString('en-US')} crew XP</Text>
            </View>
          )}
        </View>

        <ScrollView horizontal={false} scrollEnabled={false}>
          <View style={styles.awards}>
            {awards.map((a) => (
              <View key={a.key} style={[styles.award, { backgroundColor: d.surface2 }]}>
                <View style={[styles.avatar, { backgroundColor: a.userId === user?.id ? AMBER : d.dark ? '#3A362F' : '#E8E2D4' }]}>
                  <Text style={[styles.avatarText, { color: a.userId === user?.id ? INK : d.ink }]}>{initials(a.name)}</Text>
                  <View style={[styles.gem, { borderColor: d.surface2 }]} />
                </View>
                <Text style={[styles.awardLabel, { color: d.ink2 }]}>{a.award}</Text>
                <Text style={[styles.awardName, { color: d.ink }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[styles.awardValue, { color: d.ink2 }]}>{a.value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity onPress={share} accessibilityRole="button" style={styles.share}>
          <Text style={styles.shareText}>Share ride story</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { flex: 1 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  glass: { height: 44, width: 44, borderRadius: 22, backgroundColor: 'rgba(255,253,248,0.2)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER },
  chip: { color: '#FFFDF8', fontFamily: F.extra, fontSize: 13 },
  tiles: { position: 'absolute', left: 16, right: 16, bottom: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', height: 86, borderRadius: 20, padding: 12, backgroundColor: 'rgba(26,24,20,0.5)', justifyContent: 'space-between' },
  tileLabel: { color: 'rgba(255,253,248,0.82)', fontFamily: F.bold, fontSize: 12 },
  tileValue: { color: '#FFFDF8', fontFamily: F.monoBold, fontSize: 24, letterSpacing: -0.4 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.4 },
  xp: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  xpText: { fontFamily: F.monoBold, fontSize: 13 },
  awards: { flexDirection: 'row', gap: 8 },
  award: { flex: 1, borderRadius: 16, padding: 12, gap: 6 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.black, fontSize: 11 },
  gem: { position: 'absolute', right: -4, bottom: -3, width: 13, height: 13, borderRadius: 3, backgroundColor: AMBER, borderWidth: 2, transform: [{ rotate: '45deg' }] },
  awardLabel: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  awardName: { fontFamily: F.extra, fontSize: 14 },
  awardValue: { fontFamily: F.monoBold, fontSize: 12 },
  share: { height: 52, borderRadius: 26, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  shareText: { color: INK, fontFamily: F.black, fontSize: 15 },
});
