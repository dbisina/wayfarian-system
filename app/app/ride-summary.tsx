// app/app/ride-summary.tsx
// Shown right after a ride ends. Appears instantly from the numbers recorded on the phone, then
// switches to the server's authoritative numbers (and the XP / badges / level-up they earned)
// as soon as the ride has uploaded, which may be later if the phone is offline.

import React, { useMemo } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../constants/design';
import { useLiveRide, useSyncState, useV2Vehicle } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { badgeTitle } from '../v2/badges';
import { projectRoute } from '../v2/route';
import { speedStrip } from '../v2/speed';
import { formatDistance, formatDuration, formatSpeed } from '../v2/format';

const MAP_H = 290;

export default function RideSummaryScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const live = useLiveRide();
  const sync = useSyncState();

  // Poll until the server has finalized this ride; stop afterwards.
  const ride = useQuery({
    queryKey: ['ride-summary', rideId],
    queryFn: () => getRuntime().client.getRide(rideId!),
    enabled: !!rideId,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === 'FINALIZED' ? false : 3000),
  });
  const route = useQuery({
    queryKey: ['route', rideId],
    queryFn: () => getRuntime().client.rideRoute(rideId!, 600),
    enabled: !!rideId && ride.data?.status === 'FINALIZED',
    staleTime: Infinity,
  });
  const vehicle = useV2Vehicle(ride.data?.vehicleId || undefined);
  const photos = useQuery({
    queryKey: ['ride-photos', rideId],
    queryFn: () => getRuntime().client.ridePhotos(rideId!),
    enabled: !!rideId && ride.data?.status === 'FINALIZED',
    staleTime: 60_000,
  });
  const moments = photos.data?.items ?? [];

  const server = ride.data?.status === 'FINALIZED' ? ride.data : null;
  const local = live && live.rideId === rideId ? live : null;
  const stats = server
    ? { distanceM: server.distanceM, movingTimeS: server.movingTimeS, avgSpeedMps: server.avgSpeedMps, topSpeedMps: server.topSpeedMps }
    : local
      ? { distanceM: local.distanceM, movingTimeS: local.movingTimeS, avgSpeedMps: local.avgSpeedMps, topSpeedMps: local.topSpeedMps }
      : null;

  const lines = useMemo(() => projectRoute(route.data?.points ?? []).map((p) => p), [route.data]);
  const strip = useMemo(() => speedStrip(route.data?.points ?? [], 40), [route.data]);
  const started = server ? new Date(server.startedAt) : null;
  const ended = server?.endedAt ? new Date(server.endedAt) : null;
  const clock = (dt: Date) => dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const earned: { title: string; blurb: string } | null = server?.achievements?.length
    ? badgeTitle(server.achievements[0].achievementId)
    : null;
  const levelUp = server?.levelUp ?? null;
  const showBanner = !!server && (server.xpEarned > 0 || !!earned);

  const openLevelUp = () => {
    if (!levelUp) return;
    router.push({
      pathname: '/level-up',
      params: { level: String(levelUp.to), prevLevel: String(levelUp.from), xp: String(levelUp.xp), km: String(Math.round((server?.distanceM ?? 0) / 100) / 10), badge: earned?.title ?? '' },
    } as never);
  };

  const track = d.dark ? '#3A362F' : '#DDD6C7';
  const mapBg = d.dark ? '#161513' : '#ECE6D9';
  const cells = stats
    ? [
        ['Distance', formatDistance(stats.distanceM)],
        ['Moving', formatDuration(stats.movingTimeS)],
        ['Average', formatSpeed(stats.avgSpeedMps)],
        ['Top', formatSpeed(stats.topSpeedMps)],
      ]
    : [];

  return (
    <View style={[styles.root, { backgroundColor: d.surface }]}>
      <View style={{ height: MAP_H, backgroundColor: mapBg }}>
        <Svg width="100%" height={MAP_H} viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet">
          <Rect width={320} height={320} fill={mapBg} />
          {lines.map((pts, i) => (
            <Polyline key={i} points={pts} fill="none" stroke={AMBER} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {lines[0] && (() => {
            const [x, y] = lines[0].split(' ')[0].split(',').map(Number);
            return <Circle cx={x} cy={y} r={7} fill={INK} stroke="#FFFDF8" strokeWidth={3} />;
          })()}
        </Svg>
        {!lines.length && (
          <View style={styles.mapNote}>
            <Text style={{ color: d.ink2, fontFamily: F.medium }}>{ride.isLoading || route.isLoading ? 'Loading route…' : server ? 'No route recorded' : 'Route appears once the ride uploads'}</Text>
          </View>
        )}
        <View style={[styles.top, { top: Math.max(56, insets.top + 8) }]}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/log' as never)} accessibilityRole="button" accessibilityLabel="Done" style={[styles.round, { backgroundColor: d.surface }]}>
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={[styles.sheet, { backgroundColor: d.surface }]} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 4 }}>
          <Text style={[styles.mono, { color: d.ink2, fontSize: 12 }]}>
            {started ? `${started.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()} · ${clock(started)}${ended ? ` to ${clock(ended)}` : ''}` : 'JUST NOW'}
          </Text>
          <Text style={[styles.title, { color: d.ink }]}>{server?.title || 'Ride complete'}</Text>
        </View>

        {!server && (
          <View style={styles.pending}>
            <ActivityIndicator color={AMBER} />
            <Text style={{ color: d.ink2, fontFamily: F.medium, flex: 1 }}>
              {sync.pending > 0 ? 'Saved on your phone. Uploading when you are online to count your XP and badges.' : 'Counting your XP and badges…'}
            </Text>
          </View>
        )}

        {showBanner && (
          <TouchableOpacity activeOpacity={levelUp ? 0.8 : 1} onPress={openLevelUp} accessibilityRole={levelUp ? 'button' : undefined} style={styles.banner}>
            <Text style={styles.bannerXp}>+{server.xpEarned}<Text style={{ fontSize: 13 }}> XP</Text></Text>
            <View style={styles.bannerDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>{levelUp ? `Level ${levelUp.to} reached` : earned ? `${earned.title} unlocked` : 'Ride counted'}</Text>
              <Text style={styles.bannerSub}>{earned ? earned.blurb : 'Nice ride'}</Text>
            </View>
            {levelUp && <Icon name="chevron" size={18} color={INK} stroke={2.2} />}
          </TouchableOpacity>
        )}

        {cells.length > 0 && (
          <View style={[styles.grid, { borderTopColor: d.line }]}>
            {cells.map(([label, value], i) => (
              <View key={label} style={[styles.cell, { borderBottomColor: d.line, borderLeftColor: d.line, borderLeftWidth: i % 2 ? 1 : 0, paddingLeft: i % 2 ? 16 : 0 }]}>
                <Text style={[styles.cellLabel, { color: d.ink2 }]}>{label}</Text>
                <Text style={[styles.cellValue, { color: d.ink }]}>{value}</Text>
              </View>
            ))}
          </View>
        )}

        {vehicle.data && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/vehicle', params: { vehicleId: vehicle.data.id } } as never)}
            accessibilityRole="button"
            style={[styles.vehicle, { backgroundColor: d.panel }]}
          >
            {vehicle.data.photoURL ? <Image source={{ uri: vehicle.data.photoURL }} style={styles.vehicleImg} resizeMode="contain" /> : <View style={styles.vehicleImg} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: d.panelMuted }]}>Ridden on</Text>
              <Text style={[styles.vehicleName, { color: d.panelText }]}>{vehicle.data.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.mono, { color: AMBER, fontSize: 16 }]}>{Math.round(vehicle.data.riddenM / 1000).toLocaleString('en-US')} km</Text>
              <Text style={{ color: d.panelMuted, fontFamily: F.regular, fontSize: 11 }}>on this vehicle</Text>
            </View>
          </TouchableOpacity>
        )}

        {moments.length > 0 && (
          <View style={{ gap: 10 }}>
            <View style={styles.stripHead}>
              <Text style={[styles.momentsTitle, { color: d.ink }]}>Moments</Text>
              <Text style={{ color: d.ink2, fontFamily: F.bold, fontSize: 13 }}>{moments.length} photo{moments.length === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.momentsGrid}>
              {moments.slice(0, 3).map((m, i) => (
                <View key={m.id} style={[styles.moment, i === 0 && { flex: 1.4 }]}>
                  <Image source={{ uri: m.thumbnailUrl || m.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Ride photo" />
                  <Text style={styles.momentTime}>{clock(new Date(m.takenAt))}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {strip.bars.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={styles.stripHead}>
              <Text style={[styles.eyebrow, { color: d.ink2 }]}>Speed</Text>
              <Text style={[styles.mono, { color: d.ink2 }]}>
                peak {Math.round(strip.peakMps * 3.6)}{strip.peakAt ? ` at ${clock(new Date(strip.peakAt))}` : ''}
              </Text>
            </View>
            <View style={styles.strip} accessibilityRole="image" accessibilityLabel={`Speed over the ride, peaking at ${Math.round(strip.peakMps * 3.6)} kilometres per hour`}>
              {strip.bars.map((b, i) => (
                <View key={i} style={{ flex: 1, height: Math.max(2, Math.round(b.frac * 36)), borderRadius: 2, backgroundColor: b.hot ? AMBER : track }} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  mapNote: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  mono: { fontFamily: F.monoBold },
  title: { fontFamily: F.black, fontSize: 28, letterSpacing: -0.6, lineHeight: 32 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, backgroundColor: AMBER },
  bannerXp: { fontFamily: F.monoBold, fontSize: 24, color: INK },
  bannerDivider: { width: 1.5, height: 30, backgroundColor: 'rgba(26,24,20,0.2)' },
  bannerTitle: { fontFamily: F.black, fontSize: 14, color: INK },
  bannerSub: { fontFamily: F.semi, fontSize: 12, color: 'rgba(26,24,20,0.72)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1 },
  cell: { width: '50%', paddingVertical: 12, borderBottomWidth: 1, gap: 2 },
  cellLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  cellValue: { fontFamily: F.monoBold, fontSize: 22 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16, marginTop: 6 },
  vehicleImg: { width: 64, height: 48 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  vehicleName: { fontFamily: F.black, fontSize: 16 },
  stripHead: { flexDirection: 'row', justifyContent: 'space-between' },
  momentsTitle: { fontFamily: F.black, fontSize: 18 },
  momentsGrid: { flexDirection: 'row', gap: 8 },
  moment: { flex: 1, height: 66, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.2)' },
  momentTime: { position: 'absolute', left: 8, bottom: 8, color: '#FFFDF8', fontFamily: F.monoBold, fontSize: 11, backgroundColor: 'rgba(26,24,20,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingTop: 2, paddingBottom: 1 },
  strip: { height: 36, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
});
