// app/app/manage-vehicles.tsx
// Garage — pick, open, edit and remove vehicles

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchVehicles,
  deleteVehicle,
  setDefaultVehicle,
  selectVehicles,
  selectVehiclesLoading,
} from '../store/slices/vehicleSlice';
import type { GarageVehicle } from '../services/api';
import Icon from '../components/dw/Icon';
import VehiclePhoto from '../components/dw/VehiclePhoto';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';

const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function ManageVehiclesScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const vehicles = useAppSelector(selectVehicles);
  const loading = useAppSelector(selectVehiclesLoading);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchVehicles());
  }, []);

  const selected: GarageVehicle | undefined =
    vehicles.find((v) => v.id === selectedId) ?? vehicles.find((v) => v.isDefault) ?? vehicles[0];

  const handleDelete = (vehicle: GarageVehicle) => {
    Alert.alert('Remove Vehicle', `Remove "${vehicle.name}" from your garage? Journey history will still show it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dispatch(deleteVehicle(vehicle.id)) },
    ]);
  };

  const manage = (v: GarageVehicle) => {
    Alert.alert(v.name, undefined, [
      { text: 'Edit details', onPress: () => router.push({ pathname: '/add-vehicle', params: { vehicleId: v.id } }) },
      ...(!v.isDefault ? [{ text: 'Make default', onPress: () => dispatch(setDefaultVehicle(v.id)) }] : []),
      { text: 'Remove', style: 'destructive' as const, onPress: () => handleDelete(v) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const stats = selected
    ? [
        { label: 'Type', value: typeLabel(selected.type) },
        { label: 'Year', value: selected.year ? String(selected.year) : '–' },
        { label: 'Colour', value: selected.color || '–' },
      ]
    : [];

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { paddingTop: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: d.ink }]}>Garage</Text>
          <Text style={[styles.sub, { color: d.ink2 }]}>
            {vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'}
          </Text>
        </View>
      </View>

      {loading && vehicles.length === 0 ? (
        <ActivityIndicator color={AMBER} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 22 }} showsVerticalScrollIndicator={false}>
          {selected ? (
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  {selected.isDefault && (
                    <View style={styles.defaultTag}>
                      <Text style={styles.defaultTagText}>Default</Text>
                    </View>
                  )}
                  <Text style={styles.heroName} numberOfLines={1}>{selected.name}</Text>
                  <Text style={styles.heroSub} numberOfLines={1}>
                    {selected.make} {selected.model} · {selected.type}
                  </Text>
                </View>
              </View>
              <View style={styles.heroLane} />
              {selected.photoURL ? (
                <VehiclePhoto uri={selected.photoURL} radius={22} style={styles.heroImg} />
              ) : (
                <View style={styles.heroEmpty}>
                  <Icon name="route" size={64} color="rgba(245,165,36,0.5)" stroke={1.4} />
                </View>
              )}
              <View style={styles.heroStats}>
                {stats.map((s, i) => (
                  <View key={s.label} style={[styles.heroStat, i > 0 && styles.heroStatDivider]}>
                    <Text style={styles.heroStatLabel}>{s.label}</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1}>{s.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.hero, { alignItems: 'center', justifyContent: 'center', gap: 10 }]}>
              <Text style={styles.heroName}>Your garage is empty</Text>
              <Text style={styles.heroSub}>Add your first vehicle to track it per ride</Text>
            </View>
          )}

          <View>
            <Text style={[styles.eyebrow, { color: d.ink2 }]}>In your garage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {vehicles.map((v) => {
                const on = selected?.id === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setSelectedId(v.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.chipCard,
                      { backgroundColor: d.surface },
                      on ? { borderWidth: 2.5, borderColor: AMBER } : { borderWidth: 1, borderColor: d.line2 },
                    ]}
                  >
                    {v.photoURL ? (
                      <VehiclePhoto uri={v.photoURL} radius={14} style={styles.chipImg} />
                    ) : (
                      <View style={[styles.chipImg, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Icon name="route" size={30} color={d.ink2} stroke={1.6} />
                      </View>
                    )}
                    <Text style={[styles.chipName, { color: d.ink }]} numberOfLines={1}>{v.name}</Text>
                    <Text style={[styles.chipSub, { color: d.ink2 }]} numberOfLines={1}>{typeLabel(v.type)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => router.push('/add-vehicle')}
                accessibilityRole="button"
                accessibilityLabel="Add a vehicle"
                style={[styles.addCard, { borderColor: d.line2 }]}
              >
                <View style={styles.addDot}>
                  <Icon name="plus" size={16} color={INK} stroke={3} />
                </View>
                <Text style={[styles.chipName, { color: d.ink }]}>Add</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {selected && (
        <View style={[styles.actions, { bottom: Math.max(30, insets.bottom + 10) }]}>
          <TouchableOpacity
            onPress={() => manage(selected)}
            accessibilityRole="button"
            style={[styles.btn, { flex: 1, borderWidth: 1.5, borderColor: d.line2 }]}
          >
            <Text style={[styles.btnText, { color: d.ink }]}>Manage</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/vehicle', params: { vehicleId: selected.id } } as never)}
            accessibilityRole="button"
            style={[styles.btn, { flex: 1.3, backgroundColor: d.ink }]}
          >
            <Text style={[styles.btnText, { color: d.bg, fontFamily: F.black }]} numberOfLines={1}>Open {selected.name}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.black, fontSize: 26, lineHeight: 28, letterSpacing: -0.5 },
  sub: { fontFamily: F.regular, fontSize: 12 },
  hero: { height: 396, borderRadius: 32, backgroundColor: '#161513', overflow: 'hidden', padding: 20 },
  heroTop: { flexDirection: 'row' },
  defaultTag: { alignSelf: 'flex-start', backgroundColor: AMBER, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  defaultTagText: { fontFamily: F.black, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: INK },
  heroName: { fontFamily: F.black, fontSize: 24, letterSpacing: -0.5, color: '#F2EEE5', marginTop: 6 },
  heroSub: { fontFamily: F.regular, fontSize: 12, color: '#A29B8D' },
  heroLane: { position: 'absolute', left: 0, right: 0, top: 322, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(245,165,36,0.4)' },
  heroImg: { position: 'absolute', left: 20, right: 20, top: 100, height: 206 },
  heroEmpty: { position: 'absolute', left: 0, right: 0, top: 120, alignItems: 'center' },
  heroStats: { position: 'absolute', left: 20, right: 20, bottom: 16, flexDirection: 'row' },
  heroStat: { flex: 1 },
  heroStatDivider: { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: 'rgba(242,238,229,0.1)' },
  heroStatLabel: { fontFamily: F.extra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#A29B8D' },
  heroStatValue: { fontFamily: F.monoBold, fontSize: 17, color: '#F2EEE5' },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 4, marginBottom: 10 },
  chipCard: { width: 132, height: 116, borderRadius: 22, overflow: 'hidden', paddingHorizontal: 12, justifyContent: 'flex-end', paddingBottom: 10 },
  chipImg: { position: 'absolute', left: 10, right: 10, top: 10, height: 64 },
  chipName: { fontFamily: F.black, fontSize: 14 },
  chipSub: { fontFamily: F.monoBold, fontSize: 11 },
  addCard: { width: 96, height: 116, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  actions: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 10 },
  btn: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnText: { fontFamily: F.extra, fontSize: 14 },
});
