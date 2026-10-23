// app/app/group-live.tsx
// The live view of a group ride: everyone on the map, and the order on the road with who is
// ahead, who is behind and who has stopped. Positions are live-only (never stored); your own
// ride is recorded normally by the ride screen.

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, INK, useDW } from '../constants/design';
import { useLiveRide, useV2GroupRide } from '../v2/hooks';
import { usePresence } from '../v2/usePresence';
import { endRide } from '../v2/rideController';
import { getRuntime } from '../v2/runtime';
import { initials, orderRiders, type BoardRider } from '../v2/liveBoard';
import { formatDistance, formatDuration, formatSpeed } from '../v2/format';

export default function GroupLiveScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useV2GroupRide(id);
  const live = useLiveRide();
  const riders = usePresence(id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of group.data?.participants ?? []) m.set(p.userId, p.displayName || 'Rider');
    return m;
  }, [group.data]);

  const board = useMemo<BoardRider[]>(() => {
    const out: BoardRider[] = riders.map((r) => ({
      userId: r.userId,
      name: names.get(r.userId) || r.displayName || 'Rider',
      distanceM: r.distanceM,
      speedMps: r.speedMps,
      lastMovedAt: r.lastMovedAt,
    }));
    if (user?.id) {
      const speed = live?.lastFix?.speedMps ?? null;
      out.push({
        userId: user.id,
        name: 'You',
        distanceM: live?.distanceM ?? null,
        speedMps: speed,
        lastMovedAt: speed != null && speed < 1 ? (live?.lastFix?.t ?? now) : now,
        isSelf: true,
      });
    }
    return out;
  }, [riders, names, user?.id, live, now]);

  const rows = useMemo(() => orderRiders(board, now), [board, now]);
  const me = live?.lastFix;
  const started = group.data?.startedAt ? new Date(group.data.startedAt).getTime() : null;
  const elapsed = started ? Math.max(0, Math.round((now - started) / 1000)) : 0;
  const dest = group.data?.destinationLat != null ? { latitude: group.data.destinationLat, longitude: group.data.destinationLng } : null;
  const surface2 = d.dark ? '#2A2723' : '#EFEAE0';
  const warn = d.dark ? '#FFB86B' : '#A4520B';

  const leave = async () => {
    try {
      const rideId = await endRide();
      await getRuntime().client.leaveGroupRide(id);
      router.replace(rideId ? ({ pathname: '/ride-summary', params: { rideId } } as never) : ('/(tabs)/log' as never));
    } catch (e: any) {
      Alert.alert('Could not leave', e?.message || 'Try again');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        showsUserLocation
        initialRegion={me ? { latitude: me.lat, longitude: me.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
      >
        {riders.map((r) => (
          <Marker key={r.userId} coordinate={{ latitude: r.lat, longitude: r.lng }} title={names.get(r.userId) || r.displayName || 'Rider'}>
            <View style={[styles.pin, { backgroundColor: INK, borderColor: '#FFFDF8' }]}>
              <Text style={[styles.pinText, { color: AMBER }]}>{initials(names.get(r.userId) || r.displayName || '?')}</Text>
            </View>
          </Marker>
        ))}
        {dest && <Marker coordinate={dest} title={group.data?.destinationName || 'Destination'} pinColor={AMBER} />}
      </MapView>

      <View style={[styles.topBar, { top: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Minimise" style={[styles.round, { backgroundColor: d.surface }]}>
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <View style={[styles.status, { backgroundColor: d.surface }]} accessibilityRole="text">
          <View style={styles.live} />
          <Text style={[styles.statusTitle, { color: d.ink }]} numberOfLines={1}>
            {group.data?.title ?? 'Group ride'}{group.data?.destinationName ? ` · to ${group.data.destinationName}` : ''}
          </Text>
          <Text style={[styles.mono, { color: d.ink }]}>{formatDuration(elapsed)}</Text>
        </View>
      </View>

      <View style={[styles.sheet, { backgroundColor: d.surface, paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={[styles.handle, { backgroundColor: d.line2 }]} />
        <View style={styles.speedRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={[styles.speed, { color: d.ink }]}>{Math.round((live?.lastFix?.speedMps ?? 0) * 3.6)}</Text>
            <Text style={[styles.unit, { color: d.ink2 }]}>km/h</Text>
          </View>
          <Text style={[styles.mono, { color: d.ink2, fontSize: 14 }]}>{formatDistance(live?.distanceM ?? 0)} ridden</Text>
        </View>

        <ScrollView style={{ maxHeight: 190 }} accessibilityLabel="Order on the road">
          {rows.map((r) => (
            <View key={r.userId} style={[styles.row, { borderTopColor: d.line }]}>
              <Text style={[styles.pos, { color: d.ink2 }]}>{r.position}</Text>
              <View style={[styles.avatar, { backgroundColor: r.isSelf ? AMBER : surface2 }]}>
                <Text style={[styles.avatarText, { color: r.isSelf ? INK : d.ink }]}>{initials(r.name)}</Text>
              </View>
              <Text style={[styles.name, { color: d.ink }]}>{r.name}</Text>
              <Text style={[styles.mono, { color: r.stopped ? warn : d.ink2, fontSize: 12 }]}>{r.status}</Text>
            </View>
          ))}
          {rows.length === 1 && <Text style={{ color: d.ink2, fontFamily: F.medium, paddingVertical: 12 }}>Waiting for the others to show up on the road.</Text>}
        </ScrollView>

        <View style={styles.controls}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/ride', params: { groupRideId: id } } as never)} accessibilityRole="button" accessibilityLabel="Open my ride" style={[styles.iconBtn, { backgroundColor: surface2 }]}>
            <Icon name="route" size={22} color={d.ink} stroke={1.9} />
          </TouchableOpacity>
          <Pressable
            onLongPress={leave}
            delayLongPress={1500}
            accessibilityRole="button"
            accessibilityHint="Press and hold to leave the ride"
            style={[styles.leave, { backgroundColor: d.dark ? '#F2EEE5' : INK }]}
          >
            <View style={[styles.stop, { backgroundColor: d.dark ? INK : '#F4F1E9' }]} />
            <Text style={[styles.leaveText, { color: d.dark ? INK : '#F4F1E9' }]}>Hold to leave ride</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  status: { flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER },
  statusTitle: { flex: 1, fontFamily: F.extra, fontSize: 13 },
  mono: { fontFamily: F.monoBold, fontSize: 13 },
  pin: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontFamily: F.black, fontSize: 11 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
  speedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 },
  speed: { fontFamily: F.extra, fontSize: 52, letterSpacing: -2 },
  unit: { fontFamily: F.extra, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46, borderTopWidth: 1 },
  pos: { width: 18, fontFamily: F.monoBold, fontSize: 12 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.black, fontSize: 10 },
  name: { flex: 1, fontFamily: F.extra, fontSize: 14 },
  controls: { flexDirection: 'row', gap: 10, marginTop: 10 },
  iconBtn: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  leave: { flex: 1, height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  stop: { width: 12, height: 12, borderRadius: 3 },
  leaveText: { fontFamily: F.extra, fontSize: 15 },
});
