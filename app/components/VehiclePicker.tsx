// app/components/VehiclePicker.tsx
// Bottom-sheet modal for selecting a vehicle before a journey

import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchVehicles, selectVehicleForJourney, selectVehicles, selectVehiclesLoading } from '../store/slices/vehicleSlice';
import VehicleCard from './VehicleCard';
import { router } from 'expo-router';
import type { GarageVehicle } from '../services/api';

interface VehiclePickerProps {
  visible: boolean;
  selectedId: string | null;
  onSelect: (vehicle: GarageVehicle | null) => void;
  onClose: () => void;
}

export default function VehiclePicker({ visible, selectedId, onSelect, onClose }: VehiclePickerProps) {
  const dispatch = useAppDispatch();
  const vehicles = useAppSelector(selectVehicles);
  const loading = useAppSelector(selectVehiclesLoading);

  useEffect(() => {
    if (visible && vehicles.length === 0) {
      dispatch(fetchVehicles());
    }
  }, [visible]);

  const handleSelect = (vehicle: GarageVehicle) => {
    dispatch(selectVehicleForJourney(vehicle.id));
    onSelect(vehicle);
    onClose();
  };

  const handleNoVehicle = () => {
    dispatch(selectVehicleForJourney(null));
    onSelect(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>Select Vehicle</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#757575" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#F9A825" style={{ marginVertical: 40 }} />
          ) : vehicles.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏍️</Text>
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptySub}>Add your first vehicle to track it per journey</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => { onClose(); router.push('/add-vehicle'); }}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.addBtnText}>Add Vehicle</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {vehicles.map(v => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  compact
                  selected={selectedId === v.id}
                  onPress={() => handleSelect(v)}
                />
              ))}

              <TouchableOpacity style={styles.addVehicleRow} onPress={() => { onClose(); router.push('/add-vehicle'); }}>
                <View style={styles.addVehicleIcon}>
                  <Ionicons name="add" size={20} color="#F9A825" />
                </View>
                <Text style={styles.addVehicleText}>Add new vehicle</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.noVehicleRow} onPress={handleNoVehicle}>
                <Ionicons name="close-circle-outline" size={20} color="#9E9E9E" />
                <Text style={styles.noVehicleText}>No vehicle / skip</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    position: 'relative',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#000' },
  closeBtn: { position: 'absolute', right: 20, top: 12 },
  list: { flex: 1 },
  listContent: { padding: 16 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#000' },
  emptySub: { fontSize: 14, color: '#757575', textAlign: 'center', marginBottom: 20 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9A825',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  addVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
  },
  addVehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(249, 168, 37, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVehicleText: { fontSize: 15, fontWeight: '600', color: '#F9A825' },
  noVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  noVehicleText: { fontSize: 14, color: '#9E9E9E' },
});
