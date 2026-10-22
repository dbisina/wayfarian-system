// app/app/ride.tsx
// Record a ride on the v2 engine. Works with no connection: every fix is saved on the phone and
// uploaded later. Stats shown here come from the same ride-core code the server uses.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AMBER, F, useDW } from '../constants/design';
import { useLiveRide, useSyncState } from '../v2/hooks';
import { endRide, pauseRide, resumeRide, startRide, takeRidePhoto } from '../v2/rideController';
import { formatDistance, formatDuration, formatSpeed } from '../v2/format';

export default function RideScreen() {
  const dw = useDW();
  const router = useRouter();
  const { groupRideId, vehicleId, vehicleType } = useLocalSearchParams<{ groupRideId?: string; vehicleId?: string; vehicleType?: string }>();
  const live = useLiveRide();
  const sync = useSyncState();
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  // Start once on open, unless a ride (for example one recovered after a crash) is already running.
  useEffect(() => {
    if (started) return;
    setStarted(true);
    if (live && live.status !== 'ENDED') return;
    startRide({ groupRideId, vehicleId, vehicleType }).then((res) => {
      if (res.ok) return;
      if (res.reason === 'permission') {
        Alert.alert('Location needed', 'Wayfarian needs location access to record your ride. Turn it on in Settings.', [{ text: 'OK', onPress: () => router.back() }]);
      }
    });
  }, [started, live, groupRideId, vehicleId, vehicleType, router]);

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

  const onEnd = useCallback(() => {
    Alert.alert('End ride?', 'Your ride will be saved and uploaded when you have a connection.', [
      { text: 'Keep riding', style: 'cancel' },
      {
        text: 'End ride',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          let rideId: string | null = null;
          try { rideId = await endRide(); } finally { setBusy(false); }
          router.replace(rideId ? ({ pathname: '/ride-summary', params: { rideId } } as never) : ('/(tabs)/log' as never));
        },
      },
    ]);
  }, [router]);

  if (!live) {
    return <SafeAreaView style={[styles.center, { backgroundColor: dw.bg }]}><ActivityIndicator color={AMBER} /></SafeAreaView>;
  }

  const paused = live.status === 'PAUSED';
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dw.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.badge, { color: paused ? dw.ink2 : dw.ok, fontFamily: F.monoBold }]}>{paused ? 'PAUSED' : 'RECORDING'}</Text>
        {sync.pending > 0 && (
          <Text style={[styles.sync, { color: dw.ink2, fontFamily: F.medium }]}>{sync.pending} waiting to upload</Text>
        )}
      </View>

      <View style={styles.hero}>
        <Text style={[styles.heroValue, { color: dw.ink, fontFamily: F.black }]}>{formatDistance(live.distanceM)}</Text>
        <Text style={[styles.heroLabel, { color: dw.ink2, fontFamily: F.semi }]}>DISTANCE</Text>
      </View>

      <View style={styles.row}>
        <Stat label="MOVING" value={formatDuration(live.movingTimeS)} />
        <Stat label="AVG" value={formatSpeed(live.avgSpeedMps)} />
        <Stat label="TOP" value={formatSpeed(live.topSpeedMps)} />
      </View>

      <View style={styles.controls}>
        <Pressable disabled={busy} onPress={onPhoto} accessibilityRole="button" accessibilityLabel="Take a photo" style={[styles.btn, { flex: 0, width: 64, backgroundColor: dw.surface, borderColor: dw.line2 }]}>
          <Text style={[styles.btnText, { color: dw.ink, fontFamily: F.bold }]}>Photo</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={onPause} style={[styles.btn, { backgroundColor: dw.surface, borderColor: dw.line2 }]} accessibilityRole="button">
          <Text style={[styles.btnText, { color: dw.ink, fontFamily: F.bold }]}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={onEnd} style={[styles.btn, { backgroundColor: AMBER, borderColor: AMBER }]} accessibilityRole="button">
          <Text style={[styles.btnText, { color: '#1A1814', fontFamily: F.black }]}>End ride</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  function Stat({ label, value }: { label: string; value: string }) {
    return (
      <View style={[styles.stat, { backgroundColor: dw.surface, borderColor: dw.line }]}>
        <Text style={[styles.statValue, { color: dw.ink, fontFamily: F.monoBold }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: dw.ink2, fontFamily: F.semi }]}>{label}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  badge: { fontSize: 13, letterSpacing: 1.5 },
  sync: { fontSize: 13 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroValue: { fontSize: 72, letterSpacing: -2 },
  heroLabel: { fontSize: 13, letterSpacing: 2, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontSize: 22 },
  statLabel: { fontSize: 11, letterSpacing: 1.5, marginTop: 4 },
  controls: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  btnText: { fontSize: 17 },
});
