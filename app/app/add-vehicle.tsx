// app/app/add-vehicle.tsx
// Add or edit a garage vehicle

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  createVehicle,
  updateVehicle,
  uploadVehiclePhoto,
  selectVehicles,
} from '../store/slices/vehicleSlice';

const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { value: 'car',        label: 'Car',        emoji: '🚗' },
  { value: 'scooter',    label: 'Scooter',    emoji: '🛵' },
  { value: 'bike',       label: 'Bicycle',    emoji: '🚲' },
  { value: 'truck',      label: 'Truck',      emoji: '🚚' },
  { value: 'van',        label: 'Van',        emoji: '🚐' },
] as const;

export default function AddVehicleScreen() {
  const dispatch = useAppDispatch();
  const params = useLocalSearchParams<{ vehicleId?: string; fromOnboarding?: string }>();
  const vehicles = useAppSelector(selectVehicles);
  const editingVehicle = params.vehicleId ? vehicles.find(v => v.id === params.vehicleId) : null;
  const isOnboarding = params.fromOnboarding === '1';

  const [name, setName] = useState(editingVehicle?.name ?? '');
  const [make, setMake] = useState(editingVehicle?.make ?? '');
  const [model, setModel] = useState(editingVehicle?.model ?? '');
  const [year, setYear] = useState(editingVehicle?.year ? String(editingVehicle.year) : '');
  const [color, setColor] = useState(editingVehicle?.color ?? '');
  const [type, setType] = useState<string>(editingVehicle?.type ?? 'motorcycle');
  const [photoUri, setPhotoUri] = useState<string | null>(editingVehicle?.photoURL ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const isEditing = !!editingVehicle;

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Photo library access is needed to add a vehicle photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !make.trim() || !model.trim()) {
      Alert.alert('Required fields', 'Please enter a name, make, and model.');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        make: make.trim(),
        model: model.trim(),
        year: year ? parseInt(year) : null,
        color: color.trim() || null,
        type,
      };

      let savedId: string;
      if (isEditing) {
        const res = await dispatch(updateVehicle({ id: editingVehicle!.id, data })).unwrap();
        savedId = res.id;
      } else {
        const res = await dispatch(createVehicle(data)).unwrap();
        savedId = res.id;
      }

      // Upload new local photo if changed
      if (photoUri && !photoUri.startsWith('http')) {
        setUploadingPhoto(true);
        await dispatch(uploadVehiclePhoto({ id: savedId, uri: photoUri })).unwrap();
      }

      if (isOnboarding) {
        router.replace('/(tabs)');
      } else {
        router.back();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save vehicle. Please try again.');
    } finally {
      setSaving(false);
      setUploadingPhoto(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        {isOnboarding ? (
          <View style={{ width: 40 }} />
        ) : (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>
          {isOnboarding ? '🚗 Add Your Vehicle' : isEditing ? 'Edit Vehicle' : 'Add Vehicle'}
        </Text>
        {isOnboarding ? (
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Onboarding hint */}
      {isOnboarding && (
        <Text style={styles.onboardingHint}>
          Add a vehicle to show on your journeys and leaderboard. You can add more later in Settings.
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Photo */}
        <TouchableOpacity style={styles.photoContainer} onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={36} color="#9E9E9E" />
              <Text style={styles.photoPlaceholderText}>Add Photo</Text>
            </View>
          )}
          <View style={styles.cameraButton}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="camera" size={16} color="#FFF" />
            )}
          </View>
        </TouchableOpacity>

        {/* Vehicle Type */}
        <Text style={styles.sectionLabel}>Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
          {VEHICLE_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, type === t.value && styles.typeChipSelected]}
              onPress={() => setType(t.value)}
            >
              <Text style={styles.typeEmoji}>{t.emoji}</Text>
              <Text style={[styles.typeLabel, type === t.value && styles.typeLabelSelected]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Fields */}
        <Text style={styles.sectionLabel}>Nickname *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. My Kawasaki"
          placeholderTextColor="#BDBDBD"
          maxLength={60}
        />

        <Text style={styles.sectionLabel}>Make *</Text>
        <TextInput
          style={styles.input}
          value={make}
          onChangeText={setMake}
          placeholder="e.g. Kawasaki"
          placeholderTextColor="#BDBDBD"
          maxLength={60}
        />

        <Text style={styles.sectionLabel}>Model *</Text>
        <TextInput
          style={styles.input}
          value={model}
          onChangeText={setModel}
          placeholder="e.g. Z900"
          placeholderTextColor="#BDBDBD"
          maxLength={60}
        />

        <View style={styles.row}>
          <View style={styles.halfCol}>
            <Text style={styles.sectionLabel}>Year</Text>
            <TextInput
              style={styles.input}
              value={year}
              onChangeText={setYear}
              placeholder="2022"
              placeholderTextColor="#BDBDBD"
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.sectionLabel}>Color</Text>
            <TextInput
              style={styles.input}
              value={color}
              onChangeText={setColor}
              placeholder="Metallic Blue"
              placeholderTextColor="#BDBDBD"
              maxLength={40}
            />
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Add Vehicle'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  content: { padding: 20, paddingBottom: 48 },
  photoContainer: {
    alignSelf: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  photo: { width: 160, height: 120, borderRadius: 16, backgroundColor: '#F5F5F5', resizeMode: 'cover' },
  photoPlaceholder: {
    width: 160,
    height: 120,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    gap: 6,
  },
  photoPlaceholderText: { fontSize: 13, color: '#9E9E9E', fontWeight: '500' },
  cameraButton: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#757575', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.4 },
  typeScroll: { marginHorizontal: -4 },
  typeChip: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  typeChipSelected: { borderColor: '#F9A825', backgroundColor: 'rgba(249, 168, 37, 0.08)' },
  typeEmoji: { fontSize: 22, marginBottom: 3 },
  typeLabel: { fontSize: 12, fontWeight: '500', color: '#424242' },
  typeLabelSelected: { color: '#E65100', fontWeight: '700' },
  input: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  row: { flexDirection: 'row', gap: 12 },
  halfCol: { flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F9A825',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 32,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  skipText: { fontSize: 14, fontWeight: '600', color: '#F9A825' },
  onboardingHint: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    lineHeight: 18,
  },
});
