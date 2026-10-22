import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Platform, StatusBar, KeyboardAvoidingView } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
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
  const d = useDW();
  const insets = useSafeAreaInsets();
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

  const typeLabel = VEHICLE_TYPES.find((v) => v.value === type)?.label ?? 'Vehicle';
  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string, extra?: object) => (
    <View style={[styles.field, { backgroundColor: d.surface, borderColor: d.line }]}>
      <Text style={[styles.fieldLabel, { color: d.ink2 }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { color: d.ink }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={d.ink2}
        maxLength={60}
        {...extra}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: d.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { paddingTop: Math.max(56, insets.top + 8) }]}>
        {isOnboarding ? (
          <View style={{ width: 44 }} />
        ) : (
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
          >
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
        )}
        <Text style={[styles.h1, { color: d.ink }]}>
          {isOnboarding ? 'What do you ride?' : isEditing ? 'Edit vehicle' : 'Add vehicle'}
        </Text>
        {isOnboarding && (
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} accessibilityRole="button" style={{ padding: 10 }}>
            <Text style={[styles.skip, { color: d.ink2 }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.stage}
          onPress={handlePickPhoto}
          disabled={uploadingPhoto}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Change vehicle photo"
        >
          <View style={styles.stageLane} />
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.stagePhoto} resizeMode="contain" />
          ) : (
            <View style={[styles.stagePhoto, { alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
              <Ionicons name="camera-outline" size={34} color="rgba(242,238,229,0.5)" />
              <Text style={styles.stageHint}>Add a photo of your {typeLabel.toLowerCase()}</Text>
            </View>
          )}
          {uploadingPhoto && (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }]}>
              <ActivityIndicator color={AMBER} />
            </View>
          )}
          <View style={styles.callIt}>
            <Text style={styles.callItLabel}>Call it</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Bluebird"
              placeholderTextColor="rgba(242,238,229,0.4)"
              maxLength={60}
              style={styles.callItInput}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.types} accessibilityRole="radiogroup">
          {VEHICLE_TYPES.map((k) => {
            const on = type === k.value;
            return (
              <TouchableOpacity
                key={k.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setType(k.value)}
                style={[
                  styles.type,
                  on
                    ? { backgroundColor: d.amberTint, borderWidth: 2.5, borderColor: AMBER }
                    : { backgroundColor: d.surface, borderWidth: 1, borderColor: d.line },
                ]}
              >
                {'image' in k ? (
                  <Image source={k.image} style={styles.typeImg} resizeMode="contain" />
                ) : (
                  <MaterialIcons name={k.icon as any} size={30} color={on ? AMBER : d.ink2} />
                )}
                <Text style={[styles.typeLabel, { color: d.ink }]} numberOfLines={1}>{k.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {field('Make', make, setMake, 'e.g. BMW')}
        {field('Model', model, setModel, 'e.g. R 1250 RT')}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>{field('Year', year, setYear, '2023', { keyboardType: 'numeric', maxLength: 4 })}</View>
          <View style={{ flex: 1 }}>{field('Colour', color, setColor, 'Blue')}</View>
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        accessibilityRole="button"
        style={[styles.cta, { bottom: Math.max(30, insets.bottom + 10), opacity: saving ? 0.6 : 1 }]}
      >
        {saving ? (
          <ActivityIndicator color={INK} />
        ) : (
          <>
            <Icon name="nav" size={18} color={INK} fill />
            <Text style={styles.ctaText}>{isOnboarding ? 'Start riding' : 'Save vehicle'}</Text>
          </>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { flex: 1, fontFamily: F.black, fontSize: 28, letterSpacing: -0.7 },
  skip: { fontFamily: F.extra, fontSize: 14 },
  stage: { height: 262, borderRadius: 32, backgroundColor: '#161513', overflow: 'hidden' },
  stageLane: { position: 'absolute', left: 0, right: 0, top: 196, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(245,165,36,0.4)' },
  stagePhoto: { position: 'absolute', left: 40, right: 40, top: 0, height: 210 },
  stageHint: { fontFamily: F.bold, fontSize: 13, color: 'rgba(242,238,229,0.6)' },
  callIt: { position: 'absolute', left: 14, right: 14, bottom: 14, height: 44, borderRadius: 22, backgroundColor: 'rgba(242,238,229,0.1)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  callItLabel: { fontFamily: F.extra, fontSize: 12, color: '#A29B8D' },
  callItInput: { flex: 1, fontFamily: F.extra, fontSize: 16, color: '#F2EEE5', padding: 0 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { width: '23.2%', height: 82, borderRadius: 20, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8, gap: 2, overflow: 'hidden' },
  typeImg: { width: 56, height: 42 },
  typeLabel: { fontFamily: F.extra, fontSize: 12 },
  field: { minHeight: 60, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, justifyContent: 'center' },
  fieldLabel: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  fieldInput: { fontFamily: F.bold, fontSize: 16, padding: 0 },
  cta: { position: 'absolute', left: 16, right: 16, height: 56, borderRadius: 28, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { fontFamily: F.black, fontSize: 16, color: INK },
});
