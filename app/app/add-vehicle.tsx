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
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
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
  { value: 'motorcycle', label: 'Motorcycle', image: require('../assets/images/vehicles/motorcycle.png') },
  { value: 'scooter',    label: 'Scooty',     image: require('../assets/images/vehicles/scooter.png') },
  { value: 'car',        label: 'Car',        image: require('../assets/images/vehicles/car.png') },
  { value: 'bike',       label: 'Bicycle',    image: require('../assets/images/vehicles/bicycle.png') },
  { value: 'boat',       label: 'Boat',       image: require('../assets/images/vehicles/boat.png') },
  { value: 'other',      label: 'Other',      icon: 'more-horiz' },
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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
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

      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Onboarding hint */}
        {isOnboarding && (
          <Text style={styles.onboardingHint}>
            Add a vehicle to show on your journeys and leaderboard. You can add more later in Settings.
          </Text>
        )}

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

        {/* Vehicle Type Selection Grid */}
        <Text style={styles.sectionLabel}>Vehicle Type</Text>
        <View style={styles.typeGrid}>
          {VEHICLE_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeCard, type === t.value && styles.typeCardSelected]}
              onPress={() => setType(t.value)}
              activeOpacity={0.7}
            >
              <View style={styles.typeIconContainer}>
                {'image' in t ? (
                  <Image source={t.image} style={styles.typeImage} resizeMode="contain" />
                ) : (
                  <MaterialIcons name={t.icon as any} size={32} color={type === t.value ? '#F9A825' : '#9E9E9E'} />
                )}
              </View>
              <Text style={[styles.typeLabel, type === t.value && styles.typeLabelSelected]}>{t.label}</Text>
              {type === t.value && (
                <View style={styles.selectedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#F9A825" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Fields */}
        <View style={styles.formSection}>
          <Text style={styles.fieldLabel}>Nickname *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. My Kawasaki"
            placeholderTextColor="#BDBDBD"
            maxLength={60}
          />

          <Text style={styles.fieldLabel}>Make *</Text>
          <TextInput
            style={styles.input}
            value={make}
            onChangeText={setMake}
            placeholder="e.g. Kawasaki"
            placeholderTextColor="#BDBDBD"
            maxLength={60}
          />

          <Text style={styles.fieldLabel}>Model *</Text>
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
              <Text style={styles.fieldLabel}>Year</Text>
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
              <Text style={styles.fieldLabel}>Color</Text>
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
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Add Vehicle'}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    backgroundColor: '#FFFFFF',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#000', fontFamily: 'Space Grotesk' },
  content: { padding: 20, paddingBottom: 60 },
  onboardingHint: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: 'Poppins',
  },
  photoContainer: {
    alignSelf: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  photo: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#F5F5F5' },
  photoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#F9F9F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F0F0F0',
    borderStyle: 'dashed',
    gap: 8,
  },
  photoPlaceholderText: { fontSize: 13, color: '#9E9E9E', fontWeight: '600', fontFamily: 'Space Grotesk' },
  cameraButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  sectionLabel: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#000', 
    marginBottom: 16, 
    fontFamily: 'Space Grotesk' 
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  typeCard: {
    width: '31%',
    aspectRatio: 0.9,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  typeCardSelected: {
    borderColor: '#F9A825',
    backgroundColor: 'rgba(249, 168, 37, 0.04)',
    borderWidth: 2,
  },
  typeIconContainer: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  typeImage: {
    width: '100%',
    height: '100%',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: '#F9A825',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  formSection: {
    gap: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: -8,
    fontFamily: 'Space Grotesk',
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    fontFamily: 'Poppins',
  },
  row: { flexDirection: 'row', gap: 12 },
  halfCol: { flex: 1, gap: 16 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#000000',
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Space Grotesk' },
  skipText: { fontSize: 15, fontWeight: '600', color: '#F9A825', fontFamily: 'Space Grotesk' },
});
