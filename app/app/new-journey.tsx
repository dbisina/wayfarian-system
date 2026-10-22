import React, {useState, useEffect, useCallback} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Keyboard, Platform, Alert, ActivityIndicator } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Svg, { Rect, Path, G, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import LocationPicker from '../components/LocationPicker';
import { useJourney } from '../contexts/JourneyContext';
import { useSettings, Vehicle } from '../contexts/SettingsContext';
import VehiclePicker from '../components/VehiclePicker';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchVehicles, selectVehicles, selectDefaultVehicle } from '../store/slices/vehicleSlice';
import type { GarageVehicle } from '../services/api';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string;
}

export default function NewJourneyScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const { startJourney, saveJourney } = useJourney();
  const { vehicle: savedVehicle, setVehicle: persistVehicle } = useSettings();
  const dispatch = useAppDispatch();
  const garageVehicles = useAppSelector(selectVehicles);
  const defaultGarageVehicle = useAppSelector(selectDefaultVehicle);
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const [journeyName, setJourneyName] = useState('');
  const [startLocation, setStartLocation] = useState<LocationData | null>(null);
  const [endLocation, setEndLocation] = useState<LocationData | null>(null);
  const [startDateTime, setStartDateTime] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [vehicle, setVehicleLocal] = useState<Vehicle>(savedVehicle);
  const [selectedGarageVehicle, setSelectedGarageVehicle] = useState<GarageVehicle | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const keyboardVerticalOffset = Platform.select({ ios: 100, android: 140 }) ?? 0;

  useEffect(() => {
    setVehicleLocal(savedVehicle);
  }, [savedVehicle]);

  // Load garage vehicles; auto-select default
  useEffect(() => {
    dispatch(fetchVehicles());
  }, []);

  useEffect(() => {
    if (defaultGarageVehicle && !selectedGarageVehicle) {
      setSelectedGarageVehicle(defaultGarageVehicle);
    }
  }, [defaultGarageVehicle]);

  // Reset form fields every time the screen gains focus. Without this, if a user
  // cancels/navigates away mid-edit and comes back for a new journey, old values
  // (especially the destination) can linger — which matches the reported bug of
  // "previous destination sticking" after completing a journey.
  useFocusEffect(
    useCallback(() => {
      setJourneyName('');
      setStartLocation(null);
      setEndLocation(null);
      setNotes('');
      setStartDateTime(new Date());
    }, [])
  );

  const handleVehicleChange = (v: Vehicle) => {
    setVehicleLocal(v);
    persistVehicle(v).catch(() => {});
  };

  // Get current location for better autocomplete results
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      // Do not eagerly prompt here, Google Play prominent disclosure policy compliance
      if (status !== 'granted') {
        console.warn('Location permission not granted. Map features might be limited until a ride starts.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const handleSaveAndStart = async () => {
    const trimmedJourneyName = journeyName.trim() || endLocation?.address?.split(',')[0]?.trim() || '';

    // A solo ride runs on the v2 recorder and needs no destination: it is optional and only adds
    // the "heading to" card on the live screen. A ride started for a group still uses the old flow.
    if (!groupId) {
      const type = selectedGarageVehicle ? String(selectedGarageVehicle.type) : String(vehicle);
      router.replace({
        pathname: '/ride',
        params: {
          ...(selectedGarageVehicle?.id ? { vehicleId: selectedGarageVehicle.id } : {}),
          vehicleType: type,
          ...(trimmedJourneyName ? { title: trimmedJourneyName } : {}),
          ...(endLocation
            ? { destName: endLocation.address, destLat: String(endLocation.latitude), destLng: String(endLocation.longitude) }
            : {}),
        },
      } as never);
      return;
    }

    if (!trimmedJourneyName || !startLocation || !endLocation) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }

    setIsStarting(true);

    try {
      const success = await startJourney({
        title: trimmedJourneyName,
        startLocation: {
          latitude: startLocation.latitude,
          longitude: startLocation.longitude,
          address: startLocation.address,
        },
        endLocation: {
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
          address: endLocation.address,
        },
        vehicle: selectedGarageVehicle
          ? (selectedGarageVehicle.type as Vehicle)
          : vehicle,
        vehicleId: selectedGarageVehicle?.id,
        vehicleName: selectedGarageVehicle
          ? `${selectedGarageVehicle.name} (${selectedGarageVehicle.make} ${selectedGarageVehicle.model})`
          : undefined,
        ...(groupId ? { groupId: String(groupId) } : {}),
      });

      if (success) {
        // Navigate to journey screen to start tracking
        router.replace('/journey');
      } else {
        Alert.alert('Error', 'Failed to start journey. Please try again.');
      }
    } catch (error) {
      console.error('Error starting journey:', error);
      Alert.alert('Error', 'Failed to start journey. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSaveForLater = async () => {
    const trimmedJourneyName = journeyName.trim() || endLocation?.address?.split(',')[0]?.trim() || '';

    if (!trimmedJourneyName) {
      Alert.alert('Missing Information', 'Please choose a destination to save.');
      return;
    }
    
    setIsStarting(true);

    try {
      const success = await saveJourney({
        title: trimmedJourneyName,
        startLocation: startLocation ? {
          latitude: startLocation.latitude,
          longitude: startLocation.longitude,
          address: startLocation.address,
        } : undefined,
        endLocation: endLocation ? {
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
          address: endLocation.address,
        } : undefined,
        vehicle,
        ...(groupId ? { groupId: String(groupId) } : {}),
        startTime: startDateTime.toISOString(),
        notes,
      });

      if (success) {
        Alert.alert('Journey Saved', 'Your journey has been saved for later.', [
          {text: 'OK', onPress: () => router.back()}
        ]);
      } else {
        Alert.alert('Error', 'Failed to save journey. Please try again.');
      }
    } catch (error) {
      console.error('Error saving journey:', error);
      Alert.alert('Error', 'Failed to save journey. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const ensureFutureDate = (candidate: Date) => {
    const now = new Date();
    if (candidate.getTime() < now.getTime()) {
      return now;
    }
    return candidate;
  };

  const openAndroidTimePicker = (baseDate: Date) => {
    DateTimePickerAndroid.open({
      value: baseDate,
      mode: 'time',
      is24Hour: true,
      onChange: (_event, timeValue) => {
        if (!timeValue) {
          return;
        }
        const updated = new Date(baseDate);
        updated.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
        setStartDateTime(ensureFutureDate(updated));
      },
    });
  };

  const openDateTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: startDateTime,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (event, dateValue) => {
          if (event.type !== 'set' || !dateValue) {
            return;
          }
          const updated = new Date(startDateTime);
          updated.setFullYear(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
          openAndroidTimePicker(ensureFutureDate(updated));
        },
      });
      return;
    }
    setShowDatePicker(true);
  };

  const onDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowDatePicker(false);
      return;
    }
    if (selectedDate) {
      setStartDateTime(ensureFutureDate(selectedDate));
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const km = startLocation && endLocation ? haversineKm(startLocation, endLocation) : null;
  const map = d.dark
    ? { bg: '#161513', block: '#1E1C19', road: '#2A2723', water: '#132029' }
    : { bg: '#ECE6D9', block: '#E2DBCB', road: '#FFFDF8', water: '#C9DCDD' };
  const vehicles = garageVehicles.slice(0, 2);

  return (
    <View style={[styles.container, { backgroundColor: map.bg }]}>
      <Svg width="100%" height={460} viewBox="0 0 390 460" preserveAspectRatio="xMidYMin slice" style={StyleSheet.absoluteFill}>
        <Rect width={390} height={460} fill={map.bg} />
        <Path d="M0 360 C70 340 120 400 200 380 S330 330 390 350 L390 460 L0 460 Z" fill={map.water} />
        {[[20, 110, 80, 70], [130, 90, 90, 60], [250, 120, 110, 80], [40, 210, 110, 90], [190, 230, 70, 80], [290, 240, 80, 70]].map(([x, y, w, h], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} rx={10} fill={map.block} />
        ))}
        <G fill="none" stroke={map.road} strokeWidth={8} strokeLinecap="round">
          <Path d="M0 196 L390 214" />
          <Path d="M118 0 L130 460" />
          <Path d="M270 0 L276 460" />
        </G>
        <Path d="M90 330 C140 300 150 240 200 210 S290 160 320 100" fill="none" stroke={AMBER} strokeWidth={6} strokeLinecap="round" />
        <Circle cx={90} cy={330} r={9} fill={d.ink} stroke="#FFFDF8" strokeWidth={3} />
        <Rect x={309} y={89} width={22} height={22} rx={5} transform="rotate(45 320 100)" fill={AMBER} stroke={INK} strokeWidth={2.5} />
      </Svg>

      <View style={[styles.top, { top: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <View style={[styles.titlePill, shadow(d, 8), { backgroundColor: d.surface }]}>
          <Text style={[styles.title, { color: d.ink }]}>{groupId ? 'New group ride' : 'New solo ride'}</Text>
        </View>
      </View>

      <View
        style={[
          styles.sheetWrap,
          // With the keyboard up the sheet fills the space between the title and the keyboard, so
          // both fields and their suggestions stay visible on iOS and Android.
          kbHeight > 0
            ? { bottom: kbHeight, top: Math.max(56, insets.top + 8) + 56, maxHeight: undefined }
            : null,
        ]}
        pointerEvents="box-none"
      >
        <ScrollView
          style={[styles.sheet, { backgroundColor: d.surface }]}
          contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: Math.max(24, insets.bottom + 12), gap: 18 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.grab, { backgroundColor: d.line2 }]} />

          <View style={{ gap: 8, zIndex: 20 }}>
            <View pointerEvents="none" style={[styles.dashes, { borderColor: d.line2 }]} />
            <LocationPicker
              label="From"
              marker={<View style={[styles.dotFrom, { backgroundColor: d.ink, shadowColor: d.line2 }]} />}
              placeholder="Current location"
              value={startLocation?.address || ''}
              onLocationSelect={setStartLocation}
              onLocationClear={() => setStartLocation(null)}
              currentLocation={currentLocation || undefined}
              suggestionsPosition={kbHeight > 0 ? "bottom" : "top"}
            />
            <LocationPicker
              label="To"
              active
              marker={<View style={styles.diamond} />}
              placeholder="Where to?"
              value={endLocation?.address || ''}
              onLocationSelect={setEndLocation}
              onLocationClear={() => setEndLocation(null)}
              currentLocation={currentLocation || undefined}
              suggestionsPosition={kbHeight > 0 ? "bottom" : "top"}
            />
            {km !== null && (
              <Text style={[styles.mono, { color: d.ink2 }]}>about {km.toFixed(0)} km as the crow flies</Text>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <Text style={[styles.eyebrow, { color: d.ink2 }]}>Vehicle</Text>
            <View style={styles.vehicleRow} accessibilityRole="radiogroup">
              {vehicles.map((v, i) => {
                const on = selectedGarageVehicle?.id === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setSelectedGarageVehicle(v)}
                    style={[
                      styles.vehicle,
                      { flex: i === 0 ? 1.3 : 1 },
                      on
                        ? { borderWidth: 2, borderColor: AMBER, backgroundColor: d.amberTint }
                        : { borderWidth: 1.5, borderColor: d.line2 },
                    ]}
                  >
                    <Text style={[styles.vName, { color: d.ink }]} numberOfLines={1}>{v.name || `${v.make} ${v.model}`}</Text>
                    <Text style={[styles.vType, { color: d.ink2 }]}>{v.type.charAt(0).toUpperCase() + v.type.slice(1)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={garageVehicles.length > 2 ? 'More vehicles' : 'Add vehicle'}
                onPress={() => (garageVehicles.length > 2 ? setShowVehiclePicker(true) : router.push('/add-vehicle'))}
                style={[styles.addVehicle, { borderColor: d.line2 }]}
              >
                <Icon name="plus" size={20} color={d.ink2} stroke={2} />
              </TouchableOpacity>
            </View>
          </View>

          <VehiclePicker
            visible={showVehiclePicker}
            selectedId={selectedGarageVehicle?.id ?? null}
            onSelect={(v) => setSelectedGarageVehicle(v)}
            onClose={() => setShowVehiclePicker(false)}
          />

          <TouchableOpacity onPress={openDateTimePicker} style={styles.whenRow} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: d.ink }]}>Starts</Text>
              <Text style={[styles.rowSub, { color: d.ink2 }]}>{formatDateTime(startDateTime)}</Text>
            </View>
            <Icon name="chevron" size={18} color={d.ink2} />
          </TouchableOpacity>
          {Platform.OS === 'ios' && showDatePicker && (
            <View>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ alignSelf: 'flex-end', padding: 8 }}>
                <Text style={{ fontFamily: F.extra, fontSize: 15, color: AMBER }}>Done</Text>
              </TouchableOpacity>
              <DateTimePicker
                value={startDateTime}
                mode="datetime"
                display="spinner"
                onChange={onDateChange}
                minimumDate={new Date()}
                themeVariant={d.dark ? 'dark' : 'light'}
              />
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.later, { borderColor: d.line2 }, isStarting && { opacity: 0.6 }]}
              onPress={handleSaveForLater}
              disabled={isStarting}
              accessibilityRole="button"
            >
              <Text style={[styles.laterText, { color: d.ink }]}>Save for later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.start, isStarting && { opacity: 0.6 }]}
              onPress={handleSaveAndStart}
              disabled={isStarting}
              accessibilityRole="button"
            >
              {isStarting ? (
                <ActivityIndicator color={INK} />
              ) : (
                <>
                  <Icon name="nav" size={18} color={INK} fill />
                  <Text style={styles.startText}>Start ride</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const haversineKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titlePill: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  title: { fontFamily: F.black, fontSize: 20, letterSpacing: -0.2 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
  dashes: { position: 'absolute', left: 21, top: 30, height: 36, borderLeftWidth: 2, borderStyle: 'dashed', zIndex: 1 },
  dotFrom: { width: 14, height: 14, borderRadius: 7, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 0 },
  diamond: { width: 12, height: 12, borderRadius: 3, transform: [{ rotate: '45deg' }], backgroundColor: AMBER, borderWidth: 2, borderColor: INK, marginHorizontal: 1 },
  mono: { fontFamily: F.monoSemi, fontSize: 12, paddingLeft: 4 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  vehicleRow: { flexDirection: 'row', gap: 8 },
  vehicle: { height: 64, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
  vName: { fontFamily: F.extra, fontSize: 14 },
  vType: { fontFamily: F.regular, fontSize: 12 },
  addVehicle: { width: 52, height: 64, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  whenRow: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontFamily: F.extra, fontSize: 15 },
  rowSub: { fontFamily: F.regular, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  later: { height: 56, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: F.extra, fontSize: 14 },
  start: { flex: 1, height: 56, borderRadius: 18, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  startText: { fontFamily: F.black, fontSize: 16, color: INK },
});
