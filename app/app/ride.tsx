// app/app/ride.tsx
// Record a ride on the v2 engine, laid out as the "Live ride" board: full-bleed map with the route,
// REC pill, a stats sheet with the big speed readout, and a hold-to-finish button. Works with no
// connection: every fix is saved on the phone and uploaded later. Stats come from the same
// ride-core code the server uses.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Localization from 'expo-localization';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Icon from '../components/dw/Icon';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { useLiveRide, useSyncState } from '../v2/hooks';
import { endRide, pauseRide, resumeRide, startRide, takeRidePhoto } from '../v2/rideController';
import { formatDistance, formatDuration } from '../v2/format';
import { fallbackRegion } from '../v2/countryRegion';

const hms = (s: number) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const HOLD_MS = 1200;
const MAX_TRAIL = 6000;

export default function RideScreen() {
  const d = useDW();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groupRideId, vehicleId, vehicleType, title, destName, destLat, destLng } = useLocalSearchParams<{
    groupRideId?: string; vehicleId?: string; vehicleType?: string; title?: string; destName?: string; destLat?: string; destLng?: string;
  }>();
  const dest = destLat && destLng && Number.isFinite(Number(destLat)) && Number.isFinite(Number(destLng))
    ? { latitude: Number(destLat), longitude: Number(destLng), name: String(destName || '').split(',')[0].trim() }
    : null;
  const live = useLiveRide();
  const sync = useSyncState();
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const mapRef = useRef<MapView | null>(null);
  const hold = useRef(new Animated.Value(0)).current;
  const finishing = useRef(false);
  const frozenAt = useRef<number | null>(null);

  // Start once on open, unless a ride (for example one recovered after a crash) is already running.
  useEffect(() => {
    if (started) return;
    setStarted(true);
    if (live && live.status !== 'ENDED') return;
    startRide({ groupRideId, vehicleId, vehicleType, title: title || undefined }).then((res) => {
      if (res.ok) return;
      if (res.reason === 'permission') {
        Alert.alert('Location needed', 'Wayfarian needs location access to record your ride. Turn it on in Settings.', [{ text: 'OK', onPress: () => router.back() }]);
      }
    });
  }, [started, live, groupRideId, vehicleId, vehicleType, title, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Draw the route as fixes arrive and keep the camera on the rider.
  const fix = live?.lastFix;
  useEffect(() => {
    if (!fix) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.latitude === fix.lat && last.longitude === fix.lng) return prev;
      const next = prev.length >= MAX_TRAIL ? prev.slice(prev.length - MAX_TRAIL + 1) : prev;
      return [...next, { latitude: fix.lat, longitude: fix.lng }];
    });
    mapRef.current?.animateCamera({ center: { latitude: fix.lat, longitude: fix.lng } }, { duration: 600 });
  }, [fix?.lat, fix?.lng, fix]);

  const paused = live?.status === 'PAUSED';
  if (paused && frozenAt.current == null) frozenAt.current = now;
  if (!paused) frozenAt.current = null;
  const elapsed = live ? Math.max(0, Math.round(((frozenAt.current ?? now) - live.startedAt) / 1000)) : 0;

  const region = useMemo(
    () => fallbackRegion({ profileCountryCode: user?.countryCode, deviceRegionCode: Localization.getLocales()[0]?.regionCode }),
    [user?.countryCode]
  );

  const onPause = useCallback(async () => {
    setBusy(true);
    try { live?.status === 'PAUSED' ? await resumeRide(vehicleType) : await pauseRide(); } finally { setBusy(false); }
  }, [live?.status, vehicleType]);

  const onPhoto = useCallback(async () => {
    const res = await takeRidePhoto();
    if (!res.ok && res.reason === 'permission') {
      Alert.alert('Camera needed', 'Allow camera access in Settings to add photos to your ride.');
    }
  }, []);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    let rideId: string | null = null;
    try { rideId = await endRide(); } finally { setBusy(false); }
    router.replace(rideId ? ({ pathname: '/ride-summary', params: { rideId } } as never) : ('/(tabs)/log' as never));
  }, [router]);

  const holdStart = () => {
    if (busy) return;
    hold.setValue(0);
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) finish();
    });
  };
  const holdCancel = () => {
    hold.stopAnimation();
    Animated.timing(hold, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };

  const recenter = () => {
    if (fix) mapRef.current?.animateCamera({ center: { latitude: fix.lat, longitude: fix.lng }, zoom: 16 }, { duration: 400 });
  };

  if (!live) {
    return <View style={[styles.center, { backgroundColor: d.bg }]}><ActivityIndicator color={AMBER} /></View>;
  }

  // Straight-line distance to the destination and, once there is a steady average, a rough arrival time.
  const toDestM = dest && fix ? haversineM(fix.lat, fix.lng, dest.latitude, dest.longitude) : null;
  const eta = toDestM != null && live.avgSpeedMps > 1.5
    ? new Date(now + (toDestM / live.avgSpeedMps) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;
  const kmh = Math.round(Math.max(0, fix?.speedMps ?? 0) * 3.6);
  const avgKmh = Math.round(live.avgSpeedMps * 3.6);
  const dist = formatDistance(live.distanceM);
  const [distValue, distUnit] = dist.split(' ');
  const surface2 = d.dark ? '#2A2723' : '#EFEAE0';
  const finishBg = d.dark ? '#F2EEE5' : INK;
  const finishInk = d.dark ? INK : '#F4F1E9';
  const sh = shadow(d, 8);
  const fill = hold.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        initialRegion={fix ? { latitude: fix.lat, longitude: fix.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 } : region}
        mapPadding={{ top: 0, left: 0, right: 0, bottom: 312 }}
      >
        {trail.length > 1 && <Polyline coordinates={trail} strokeColor={AMBER} strokeWidth={6} lineCap="round" lineJoin="round" />}
        {dest && <Marker coordinate={{ latitude: dest.latitude, longitude: dest.longitude }} title={dest.name || 'Destination'} pinColor={AMBER} />}
      </MapView>

      <View style={[styles.topBar, { top: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)' as never)}
          accessibilityRole="button"
          accessibilityLabel="Minimise ride"
          style={[styles.round, { backgroundColor: d.surface }, sh]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <View style={[styles.rec, { backgroundColor: d.surface }, sh]} accessibilityRole="text">
          <View style={[styles.recDot, { backgroundColor: paused ? d.ink2 : '#E5484D', shadowColor: '#E5484D' }]} />
          <Text style={[styles.recLabel, { color: d.ink }]}>{paused ? 'PAUSED' : 'REC'}</Text>
          <Text style={[styles.recTime, { color: d.ink }]}>{hms(elapsed)}</Text>
        </View>
        <View style={styles.round} />
      </View>

      {dest && (
        <View style={[styles.dest, { top: Math.max(56, insets.top + 8) + 58, backgroundColor: d.surface }, sh]} accessibilityLabel="Destination">
          <View style={styles.destIcon}><Icon name="nav" size={20} color={INK} fill /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.destHint, { color: d.ink2 }]}>Heading to</Text>
            <Text style={[styles.destName, { color: d.ink }]} numberOfLines={1}>{dest.name || 'Destination'}</Text>
          </View>
          {toDestM != null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.destDist, { color: d.ink }]}>{formatDistance(toDestM)}</Text>
              {eta && <Text style={[styles.destHint, { color: d.ink2 }]}>ETA {eta}</Text>}
            </View>
          )}
        </View>
      )}

      {sync.pending > 0 && (
        <View style={[styles.syncChip, { top: Math.max(56, insets.top + 8) + (dest ? 136 : 56), backgroundColor: d.surface }, sh]}>
          <Text style={[styles.syncText, { color: d.ink2 }]}>{sync.pending} waiting to upload</Text>
        </View>
      )}

      <View style={[styles.rail, { bottom: 312 + Math.max(0, insets.bottom) + 16 }]}>
        <TouchableOpacity onPress={recenter} accessibilityRole="button" accessibilityLabel="Recenter" style={[styles.railBtn, { backgroundColor: d.surface }, sh]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM12 2v3M12 19v3M2 12h3M19 12h3" stroke={d.ink} strokeWidth={1.9} strokeLinecap="round" />
            <Path d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill={d.ink} />
          </Svg>
        </TouchableOpacity>
      </View>

      <View style={[styles.sheet, { backgroundColor: d.surface, paddingBottom: Math.max(16, insets.bottom + 8), height: 312 + Math.max(0, insets.bottom) }]}>
        <View style={[styles.handle, { backgroundColor: d.line2 }]} />
        <View style={styles.speedRow}>
          <View>
            <Text style={[styles.eyebrow, { color: d.ink2 }]}>SPEED</Text>
            <View style={styles.speedLine}>
              <Text style={[styles.speed, { color: d.ink }]}>{kmh}</Text>
              <Text style={[styles.unit, { color: d.ink2 }]}>km/h</Text>
            </View>
          </View>
        </View>

        <View style={[styles.stats, { borderColor: d.line }]}>
          <Stat label="DISTANCE" value={distValue} unit={distUnit} first />
          <Stat label="MOVING" value={formatDuration(live.movingTimeS)} />
          <Stat label="AVERAGE" value={String(avgKmh)} unit="km/h" />
        </View>

        <View style={styles.controls}>
          <TouchableOpacity disabled={busy} onPress={onPhoto} accessibilityRole="button" accessibilityLabel="Take a photo" style={[styles.square, { backgroundColor: surface2 }]}>
            <Icon name="camera" size={22} color={d.ink} stroke={1.9} />
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={onPause} accessibilityRole="button" accessibilityLabel={paused ? 'Resume' : 'Pause'} style={[styles.square, { backgroundColor: surface2 }]}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              {paused
                ? <Path d="M8 5.5v13l11-6.5z" fill={d.ink} />
                : <Path d="M9 6v12M15 6v12" stroke={d.ink} strokeWidth={2.4} strokeLinecap="round" />}
            </Svg>
          </TouchableOpacity>
          <Pressable
            disabled={busy}
            onPressIn={holdStart}
            onPressOut={holdCancel}
            accessibilityRole="button"
            accessibilityLabel="Hold to finish ride"
            accessibilityHint="Press and hold to end and save the ride"
            style={[styles.finish, { backgroundColor: finishBg }]}
          >
            <Animated.View pointerEvents="none" style={[styles.finishFill, { width: fill }]} />
            <View style={[styles.stop, { backgroundColor: finishInk }]} />
            <Text style={[styles.finishText, { color: finishInk }]}>Hold to finish</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  function Stat({ label, value, unit, first }: { label: string; value: string; unit?: string; first?: boolean }) {
    return (
      <View style={[styles.stat, !first && { borderLeftWidth: 1, borderLeftColor: d.line, paddingLeft: 16 }]}>
        <Text style={[styles.statLabel, { color: d.ink2 }]}>{label}</Text>
        <Text style={[styles.statValue, { color: d.ink }]}>
          {value}
          {unit ? <Text style={[styles.statUnit, { color: d.ink2 }]}> {unit}</Text> : null}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rec: { height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  recLabel: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1.2 },
  recTime: { fontFamily: F.monoBold, fontSize: 14 },
  dest: { position: 'absolute', left: 16, right: 16, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  destIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  destHint: { fontFamily: F.regular, fontSize: 12 },
  destName: { fontFamily: F.extra, fontSize: 17, letterSpacing: -0.2 },
  destDist: { fontFamily: F.monoBold, fontSize: 15 },
  syncChip: { position: 'absolute', alignSelf: 'center', height: 28, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  syncText: { fontFamily: F.semi, fontSize: 12 },
  rail: { position: 'absolute', right: 16, gap: 10 },
  railBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
  speedRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5 },
  speedLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  speed: { fontFamily: F.extra, fontSize: 92, lineHeight: 96, letterSpacing: -3 },
  unit: { fontFamily: F.extra, fontSize: 16 },
  stats: { flexDirection: 'row', marginTop: 12, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1 },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9 },
  statValue: { fontFamily: F.monoBold, fontSize: 19 },
  statUnit: { fontFamily: F.monoBold, fontSize: 12 },
  controls: { flexDirection: 'row', gap: 10, marginTop: 18 },
  square: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  finish: { flex: 1, height: 56, borderRadius: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  finishFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: AMBER },
  stop: { width: 12, height: 12, borderRadius: 3 },
  finishText: { fontFamily: F.extra, fontSize: 15 },
});
