// app/app/rider-profile.tsx
// Another rider's public profile, with their numbers set against yours. Only totals are shown:
// never routes, locations or anything private.

import React from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../constants/design';
import { useV2Rider } from '../v2/hooks';
import { formatDistance, formatSpeed } from '../v2/format';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

export default function RiderProfileScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { riderId } = useLocalSearchParams<{ riderId: string }>();
  const rider = useV2Rider(riderId);
  const r = rider.data;

  if (rider.isLoading) {
    return <View style={[styles.center, { backgroundColor: d.bg }]}><ActivityIndicator color={AMBER} /></View>;
  }
  if (!r) {
    return (
      <View style={[styles.center, { backgroundColor: d.bg }]}>
        <Text style={{ color: d.ink2, fontFamily: F.medium }}>This rider is not available right now.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: AMBER, fontFamily: F.bold, marginTop: 12 }}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  const name: string = r.displayName || 'Rider';
  const them = r.stats;
  const you = r.you;
  const rows = [
    { label: 'Distance', them: Math.round(them.distanceM / 1000).toLocaleString('en-US'), you: you ? Math.round(you.distanceM / 1000).toLocaleString('en-US') : '–', a: them.distanceM, b: you?.distanceM ?? 0 },
    { label: 'Top speed', them: String(Math.round(them.topSpeedMps * 3.6)), you: you ? String(Math.round(you.topSpeedMps * 3.6)) : '–', a: them.topSpeedMps, b: you?.topSpeedMps ?? 0 },
    { label: 'Badges', them: String(them.badges), you: you ? String(you.badges) : '–', a: them.badges, b: you?.badges ?? 0 },
    { label: 'Streak', them: String(them.streak), you: you ? String(you.streak) : '–', a: them.streak, b: you?.streak ?? 0 },
  ].map((row) => {
    const m = Math.max(row.a, row.b, 1e-9);
    return { ...row, tw: Math.round((row.a / m) * 64), yw: Math.round((row.b / m) * 64) };
  });

  const monthName = new Date().toLocaleDateString([], { month: 'long' });
  const sub = [r.vehicle ? null : null, r.monthRank ? `#${r.monthRank} in ${monthName}` : null].filter(Boolean).join(' · ');
  const last = r.latestRide;
  const lastLabel = last ? `Last ride: ${last.title || formatDistance(last.distanceM)} · ${new Date(last.startedAt).toLocaleDateString([], { weekday: 'short' })}` : null;

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.cover, { backgroundColor: INK, paddingTop: Math.max(56, insets.top + 8) }]}>
          <View style={styles.coverTop}>
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.glass}>
              <Icon name="back" size={20} color="#FFFDF8" stroke={2} />
            </TouchableOpacity>
          </View>
          {lastLabel && <View style={styles.lastRide}><Text style={styles.lastRideText}>{lastLabel}</Text></View>}
        </View>

        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: INK, shadowColor: d.bg }]}>
            {r.photoURL ? <Image source={{ uri: r.photoURL }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initials(name)}</Text>}
            <View style={[styles.lv, { borderColor: d.bg }]}><Text style={styles.lvText}>Lv {r.level}</Text></View>
          </View>
          <Text style={[styles.name, { color: d.ink }]}>{name}</Text>
          {!!sub && <Text style={{ fontFamily: F.regular, fontSize: 13, color: d.ink2 }}>{sub}</Text>}
        </View>

        {r.vehicle && (
          <TouchableOpacity activeOpacity={1} style={[styles.vehicle, { backgroundColor: d.panel }]}>
            {r.vehicle.photoURL ? <Image source={{ uri: r.vehicle.photoURL }} style={styles.vehicleImg} resizeMode="contain" /> : null}
            <View style={{ gap: 2 }}>
              <Text style={[styles.eyebrow, { color: d.panelMuted }]}>Drives</Text>
              <Text style={[styles.vehicleName, { color: d.panelText }]}>{r.vehicle.name}</Text>
              {r.vehicle.rideKm != null && <Text style={[styles.mono, { color: AMBER, fontSize: 13 }]}>{Math.round(r.vehicle.rideKm).toLocaleString('en-US')} km on it</Text>}
            </View>
          </TouchableOpacity>
        )}

        {!r.isSelf && (
          <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
            <View style={styles.vsHead}>
              <Text style={[styles.vsTitle, { color: d.ink }]}>{name.split(' ')[0]} vs you</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={styles.legend}><View style={[styles.swatch, { backgroundColor: d.ink }]} /><Text style={[styles.legendText, { color: d.ink2 }]}>{name.split(' ')[0]}</Text></View>
                <View style={styles.legend}><View style={[styles.swatch, { backgroundColor: AMBER }]} /><Text style={[styles.legendText, { color: d.ink2 }]}>You</Text></View>
              </View>
            </View>
            {rows.map((row) => (
              <View key={row.label} style={[styles.vsRow, { borderTopColor: d.line }]}>
                <View style={styles.vsSide}>
                  <Text style={[styles.mono, { color: d.ink, fontSize: 13 }]}>{row.them}</Text>
                  <View style={{ width: row.tw, height: 8, borderRadius: 4, backgroundColor: d.ink }} />
                </View>
                <Text style={[styles.vsLabel, { color: d.ink2 }]}>{row.label}</Text>
                <View style={[styles.vsSide, { justifyContent: 'flex-start' }]}>
                  <View style={{ width: row.yw, height: 8, borderRadius: 4, backgroundColor: AMBER }} />
                  <Text style={[styles.mono, { color: d.ink, fontSize: 13 }]}>{row.you}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Text style={{ fontFamily: F.regular, fontSize: 12, color: d.ink2 }}>
            {formatDistance(them.distanceM)} ridden · top {formatSpeed(them.topSpeedMps)} · {them.rides} rides
          </Text>
        </View>
      </ScrollView>

      {!r.isSelf && (
        <TouchableOpacity
          onPress={() => router.push('/group-ride' as never)}
          accessibilityRole="button"
          style={[styles.invite, { backgroundColor: d.ink, bottom: Math.max(30, insets.bottom + 12) }]}
        >
          <Text style={[styles.inviteText, { color: d.bg }]}>Invite {name.split(' ')[0]} to a ride</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 296, paddingHorizontal: 16 },
  coverTop: { flexDirection: 'row' },
  glass: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  lastRide: { position: 'absolute', right: 16, bottom: 20, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  lastRideText: { color: '#FFFDF8', fontFamily: F.extra, fontSize: 12 },
  header: { marginTop: -46, paddingHorizontal: 20, gap: 4 },
  avatar: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: 'transparent', marginBottom: 6 },
  avatarImg: { width: 78, height: 78, borderRadius: 26 },
  avatarText: { color: AMBER, fontFamily: F.black, fontSize: 30 },
  lv: { position: 'absolute', right: -10, bottom: -6, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: AMBER, borderWidth: 3, justifyContent: 'center' },
  lvText: { color: INK, fontFamily: F.monoBold, fontSize: 11 },
  name: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  vehicle: { marginHorizontal: 16, marginTop: 18, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', minHeight: 100 },
  vehicleImg: { position: 'absolute', right: -8, top: -26, width: 150, height: 150 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  vehicleName: { fontFamily: F.black, fontSize: 19 },
  mono: { fontFamily: F.monoBold },
  vsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  vsTitle: { fontFamily: F.black, fontSize: 18 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: F.bold, fontSize: 12 },
  vsRow: { flexDirection: 'row', alignItems: 'center', height: 40, borderTopWidth: 1, gap: 8 },
  vsSide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  vsLabel: { width: 86, textAlign: 'center', fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  invite: { position: 'absolute', left: 16, right: 16, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  inviteText: { fontFamily: F.black, fontSize: 15 },
});
