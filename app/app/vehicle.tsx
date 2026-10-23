// app/app/vehicle.tsx
// Single vehicle view — km ridden ring and per-vehicle ride numbers.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { useAppSelector } from '../store/hooks';
import { selectVehicles } from '../store/slices/vehicleSlice';
import { useV2Vehicle } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { useSettings } from '../contexts/SettingsContext';
import Icon from '../components/dw/Icon';
import VehiclePhoto from '../components/dw/VehiclePhoto';
import { AMBER, F, INK, useDW } from '../constants/design';

const RING_LEN = 2 * Math.PI * 60;

export default function VehicleScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const vehicles = useAppSelector(selectVehicles);
  const { convertSpeed } = useSettings();
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.isDefault) ?? vehicles[0];
  const stat = useV2Vehicle(vehicle?.id);
  const v = stat.data;
  const km = (v?.riddenM ?? 0) / 1000;
  const service = v?.service;
  const pct = service ? Math.min(1, service.pct / 100) : 0;
  const ringGoal = Math.max(500, Math.ceil((km + 1) / 500) * 500);
  const ringPct = Math.min(1, km / ringGoal);

  const stats = [
    { label: 'Top speed', value: String(convertSpeed((v?.topSpeedMps ?? 0) * 3.6)), unit: '' },
    { label: 'Longest', value: ((v?.longestM ?? 0) / 1000).toFixed(0), unit: 'km' },
    { label: 'Owned', value: String(v?.ownedMonths ?? 0), unit: 'mo' },
  ];

  const logService = () => {
    if (!vehicle) return;
    Alert.alert('Log a service', 'Mark this vehicle as serviced now? The countdown restarts from today.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log it',
        onPress: async () => {
          try {
            await getRuntime().client.logService(vehicle.id, Crypto.randomUUID(), { kind: 'service' });
            await stat.refetch();
          } catch (e: any) {
            Alert.alert('Could not log the service', e?.message || 'Try again when you are online.');
          }
        },
      },
    ]);
  };

  if (!vehicle) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: F.bold, color: '#F2EEE5' }}>No vehicle found</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.top, { top: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.glass}>
          <Icon name="back" size={20} color="#F2EEE5" stroke={2} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{vehicle.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {vehicle.make} {vehicle.model}
            {vehicle.year ? ` · ${vehicle.year}` : ''}
            {vehicle.isDefault ? ' · Default' : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/add-vehicle', params: { vehicleId: vehicle.id } })}
          accessibilityRole="button"
          accessibilityLabel="Edit vehicle"
          style={styles.glass}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M4 20h4L19 9l-4-4L4 16z" stroke="#F2EEE5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </TouchableOpacity>
      </View>

      <View style={styles.stage}>
        <Svg width={300} height={46} style={styles.floor} pointerEvents="none">
          <Defs><RadialGradient id="floor" cx="50%" cy="50%" rx="50%" ry="50%"><Stop offset="0" stopColor="#000" stopOpacity={0.75} /><Stop offset="1" stopColor="#000" stopOpacity={0} /></RadialGradient></Defs>
          <Ellipse cx={150} cy={23} rx={150} ry={23} fill="url(#floor)" />
        </Svg>
        <View style={styles.lane} />
        {vehicle.photoURL ? (
          <VehiclePhoto uri={vehicle.photoURL} radius={26} style={/\.png(\?|#|$)/i.test(vehicle.photoURL) ? styles.cutout : styles.photo} />
        ) : (
          <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="route" size={96} color="rgba(245,165,36,0.5)" stroke={1.2} />
          </View>
        )}
      </View>

      <View style={[styles.sheet, { backgroundColor: d.dark ? '#1C1A17' : '#F4F1E9' }]}>
        <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: Math.max(24, insets.bottom + 8) }} showsVerticalScrollIndicator={false}>
          <View style={styles.ringRow}>
            <View style={styles.ringBox}>
              <Svg width={140} height={140} viewBox="0 0 140 140" style={StyleSheet.absoluteFill}>
                <Circle cx={70} cy={70} r={60} fill="none" stroke={d.dark ? '#2E2B27' : '#E2DCCD'} strokeWidth={10}
                  strokeDasharray={`${RING_LEN * 0.75} ${RING_LEN}`} transform="rotate(135 70 70)" strokeLinecap="round" />
                <Circle cx={70} cy={70} r={60} fill="none" stroke={AMBER} strokeWidth={10}
                  strokeDasharray={`${RING_LEN * 0.75 * ringPct} ${RING_LEN}`} transform="rotate(135 70 70)" strokeLinecap="round" />
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={[styles.ringValue, { color: d.ink }]}>{Math.round(km).toLocaleString()}</Text>
                <Text style={[styles.ringLabel, { color: d.ink2 }]}>km ridden</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.eyebrow, { color: d.ink2 }]}>Next service</Text>
              <Text style={[styles.big, { color: service?.due ? '#E5484D' : d.ink }]}>
                {service ? Math.round(service.toGoKm).toLocaleString() : '–'}
                <Text style={[styles.bigUnit, { color: d.ink2 }]}>{service?.due ? ' km overdue' : ' km to go'}</Text>
              </Text>
              <View style={[styles.track, { backgroundColor: d.dark ? '#2E2B27' : '#E2DCCD' }]}>
                <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: service?.due ? '#E5484D' : AMBER }} />
              </View>
              <Text style={[styles.note, { color: d.ink2 }]}>
                {service?.last
                  ? `Last ${service.last.kind} ${new Date(service.last.doneAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}`
                  : 'No service logged yet'}
              </Text>
            </View>
          </View>

          <View style={[styles.stats, { borderColor: d.line }]}>
            {stats.map((s, i) => (
              <View key={s.label} style={[styles.stat, i > 0 && { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: d.line }]}>
                <Text style={[styles.statLabel, { color: d.ink2 }]}>{s.label}</Text>
                <Text style={[styles.statValue, { color: d.ink }]}>
                  {s.value}
                  {s.unit ? <Text style={{ fontSize: 11, color: d.ink2 }}> {s.unit}</Text> : null}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/log')}
              accessibilityRole="button"
              style={[styles.btn, { flex: 1, borderWidth: 1.5, borderColor: d.line2 }]}
            >
              <Text style={[styles.btnText, { color: d.ink }]}>{v?.rides ?? 0} rides on it</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={logService} accessibilityRole="button" style={[styles.btn, { flex: 1, backgroundColor: AMBER }]}>
              <Text style={[styles.btnText, { color: INK, fontFamily: F.black }]}>Log a service</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#161513' },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 5 },
  glass: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(242,238,229,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.black, fontSize: 22, lineHeight: 28, color: '#F2EEE5', includeFontPadding: false },
  sub: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: '#A29B8D', includeFontPadding: false },
  stage: { position: 'absolute', top: 104, left: 0, right: 0, height: 350 },
  lane: { position: 'absolute', left: 0, right: 0, top: 300, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(245,165,36,0.35)' },
  photo: { position: 'absolute', left: 20, right: 20, top: 8, height: 300 },
  cutout: { position: 'absolute', left: 20, right: 20, top: 0, height: 350 },
  floor: { position: 'absolute', left: 45, top: 264 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 392, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 24 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringBox: { width: 140, height: 140 },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontFamily: F.monoBold, fontSize: 26, letterSpacing: -0.8 },
  ringLabel: { fontFamily: F.extra, fontSize: 12 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  big: { fontFamily: F.monoBold, fontSize: 24 },
  bigUnit: { fontFamily: F.bold, fontSize: 13 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  note: { fontFamily: F.regular, fontSize: 12 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1 },
  stat: { flex: 1, paddingVertical: 12, gap: 2 },
  statLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  statValue: { fontFamily: F.monoBold, fontSize: 19 },
  btn: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.extra, fontSize: 14 },
});
