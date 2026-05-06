// app/app/manage-vehicles.tsx
// Garage — list, manage, delete vehicles

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchVehicles,
  deleteVehicle,
  setDefaultVehicle,
  selectVehicles,
  selectVehiclesLoading,
} from '../store/slices/vehicleSlice';
import VehicleCard from '../components/VehicleCard';
import type { GarageVehicle } from '../services/api';

export default function ManageVehiclesScreen() {
  const dispatch = useAppDispatch();
  const vehicles = useAppSelector(selectVehicles);
  const loading = useAppSelector(selectVehiclesLoading);

  useEffect(() => {
    dispatch(fetchVehicles());
  }, []);

  const handleDelete = (vehicle: GarageVehicle) => {
    Alert.alert(
      'Remove Vehicle',
      `Remove "${vehicle.name}" from your garage? Journey history will still show it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => dispatch(deleteVehicle(vehicle.id)),
        },
      ]
    );
  };

  const handleSetDefault = (vehicle: GarageVehicle) => {
    dispatch(setDefaultVehicle(vehicle.id));
  };

  const handleEdit = (vehicle: GarageVehicle) => {
    router.push({ pathname: '/add-vehicle', params: { vehicleId: vehicle.id } });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Garage</Text>
        <TouchableOpacity onPress={() => router.push('/add-vehicle')} style={styles.addBtn}>
          <Ionicons name="add" size={26} color="#F9A825" />
        </TouchableOpacity>
      </View>

      {loading && vehicles.length === 0 ? (
        <ActivityIndicator color="#F9A825" style={{ marginTop: 60 }} />
      ) : vehicles.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🏍️</Text>
          <Text style={styles.emptyTitle}>Your garage is empty</Text>
          <Text style={styles.emptySub}>Add your first vehicle to track it per journey</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={() => router.push('/add-vehicle')}>
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.emptyAddBtnText}>Add Vehicle</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <VehicleCard
              vehicle={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
              onSetDefault={!item.isDefault ? () => handleSetDefault(item) : undefined}
            />
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.addVehicleRow} onPress={() => router.push('/add-vehicle')}>
              <View style={styles.addIcon}>
                <Ionicons name="add" size={22} color="#F9A825" />
              </View>
              <Text style={styles.addVehicleText}>Add another vehicle</Text>
            </TouchableOpacity>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  list: { padding: 16, paddingBottom: 40 },
  addVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  addIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(249, 168, 37, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVehicleText: { fontSize: 15, fontWeight: '600', color: '#F9A825' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyEmoji: { fontSize: 56, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  emptySub: { fontSize: 14, color: '#757575', textAlign: 'center', marginBottom: 20 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9A825',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyAddBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
