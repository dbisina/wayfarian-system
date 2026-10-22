// app/app/ride-detail.tsx
// One finished ride from the v2 server: the stats the server computed and the route it recorded.

import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Polyline } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AMBER, F, useDW } from '../constants/design';
import { useV2Ride } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { projectRoute } from '../v2/route';
import { formatDistance, formatDuration, formatSpeed } from '../v2/format';

const SIZE = 320;

export default function RideDetailScreen() {
  const dw = useDW();
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const ride = useV2Ride(rideId);
  const route = useQuery({
    queryKey: ['route', rideId],
    queryFn: () => getRuntime().client.rideRoute(rideId!),
    enabled: !!rideId,
    staleTime: Infinity, // a finished ride's route does not change
  });
  const polylines = useMemo(() => projectRoute(route.data?.points ?? []), [route.data]);

  if (ride.isLoading) {
    return <SafeAreaView style={[styles.center, { backgroundColor: dw.bg }]}><ActivityIndicator color={AMBER} /></SafeAreaView>;
  }
  const r = ride.data;
  if (!r) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: dw.bg }]}>
        <Text style={{ color: dw.ink2, fontFamily: F.medium }}>This ride is not available offline yet.</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: AMBER, fontFamily: F.bold, marginTop: 12 }}>Back</Text></Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dw.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={{ color: AMBER, fontFamily: F.bold }}>‹ Back</Text></Pressable>
        <Text style={[styles.title, { color: dw.ink, fontFamily: F.black }]}>{r.title || 'Ride'}</Text>
        <Text style={{ color: dw.ink2, fontFamily: F.medium }}>{new Date(r.startedAt).toLocaleString()}</Text>

        <View style={[styles.map, { backgroundColor: dw.surface, borderColor: dw.line }]}>
          {polylines.length ? (
            <Svg width={SIZE} height={SIZE}>
              {polylines.map((pts, i) => (
                <Polyline key={i} points={pts} fill="none" stroke={AMBER} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </Svg>
          ) : (
            <Text style={{ color: dw.ink2, fontFamily: F.medium }}>{route.isLoading ? 'Loading route…' : 'No route recorded'}</Text>
          )}
        </View>

        <View style={styles.grid}>
          {[
            ['DISTANCE', formatDistance(r.distanceM)],
            ['MOVING', formatDuration(r.movingTimeS)],
            ['AVG SPEED', formatSpeed(r.avgSpeedMps)],
            ['TOP SPEED', formatSpeed(r.topSpeedMps)],
          ].map(([label, value]) => (
            <View key={label} style={[styles.cell, { backgroundColor: dw.surface, borderColor: dw.line }]}>
              <Text style={[styles.value, { color: dw.ink, fontFamily: F.monoBold }]}>{value}</Text>
              <Text style={[styles.label, { color: dw.ink2, fontFamily: F.semi }]}>{label}</Text>
            </View>
          ))}
        </View>
        {r.isLegacy && (
          <Text style={{ color: dw.ink2, fontFamily: F.regular, marginTop: 12 }}>
            This ride was recorded by an older version of Wayfarian, so its route is not available.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 28, marginTop: 8 },
  map: { alignSelf: 'center', width: SIZE, height: SIZE, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48%', borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  value: { fontSize: 22 },
  label: { fontSize: 11, letterSpacing: 1.5, marginTop: 4 },
});
