import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { useAppSelector } from '../store/hooks';
import { selectDefaultVehicle, selectVehicles } from '../store/slices/vehicleSlice';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUserData } from '../hooks/useUserData';
import { getCurrentApiUrl, getAuthToken } from '../services/api';
import { testApiConnection, printDiagnostics } from '../utils/apiDiagnostics';

const LEVEL_THRESHOLDS = [
  0, 100, 400, 900, 1600, 2500, 3600, 4900, 6400, 8100,
  10000, 12100, 14400, 16900, 19600, 22500, 25600, 28900, 32400, 36100,
  40000, 44100, 48400, 52900, 57600, 62500, 67600, 72900, 78400, 84100,
  90000, 96100, 102400, 108900, 115600, 122500, 129600, 136900, 144400, 152100,
  160000, 168100, 176400, 184900, 193600, 202500, 211600, 220900, 230400, 240100,
];

export default function ProfileScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const defaultVehicle = useAppSelector(selectDefaultVehicle);
  const vehicles = useAppSelector(selectVehicles);
  const { user, refreshUser } = useAuth();
  const { dashboardData, achievements, refreshData } = useUserData();
  const { convertDistance } = useSettings();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  const normalizeDistance = (value: number) => {
    if (!value) return 0;
    // API returns distance in kilometers, use as-is
    return value;
  };

  const formatDistance = (distance: number) => {
    return convertDistance(normalizeDistance(distance || 0));
  };

  const formatTime = (timeInSeconds: number) => {
    const hours = Math.floor((timeInSeconds || 0) / 3600);
    const minutes = Math.floor(((timeInSeconds || 0) % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const runDiagnostics = async () => {
    try {
      Alert.alert(t('profile.diagnostics.title'), t('profile.diagnostics.message'));
      const results = await testApiConnection();
      const allPassed = printDiagnostics(results);
      
      const message = results.tests.map((t: any) => 
        `${t.status === 'pass' ? '✅' : '❌'} ${t.name}: ${t.message}`
      ).join('\n\n');
      
      Alert.alert(
        allPassed ? t('profile.diagnostics.success') : t('profile.diagnostics.fail'),
        `API URL: ${results.apiUrl}\n\n${message}`,
        [{ text: t('common.ok') }]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    }
  };

  const handleChangePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploading(true);
        
        // Create form data
        const formData = new FormData();
        const uri = result.assets[0].uri;
        const filename = uri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        formData.append('profilePicture', {
          uri,
          name: filename,
          type,
        } as any);

        // Get auth token
        const token = await getAuthToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Upload using fetch directly to support multipart/form-data
        const apiUrl = getCurrentApiUrl();
        console.log('[Profile] Uploading to:', `${apiUrl}/user/profile-picture`);
        
        const uploadResponse = await fetch(`${apiUrl}/user/profile-picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            // Don't set Content-Type - let fetch set it automatically with boundary
          },
          body: formData,
        });

        console.log('[Profile] Upload response status:', uploadResponse.status);

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('[Profile] Upload failed:', uploadResponse.status, errorText);
          throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText.substring(0, 100)}`);
        }

        const response = await uploadResponse.json();
        console.log('[Profile] Upload response:', response);

        if (response.success) {
          Alert.alert(t('profile.photo.success'), t('profile.photo.success'));
          await refreshUser?.(response.user);
          await refreshData();
        } else {
          throw new Error(response.message || response.error || t('profile.photo.uploadFailed'));
        }
      }
    } catch (error: any) {
      console.error('[Profile] Photo upload error:', error);
      
      let errorMessage = error.message || t('profile.photo.uploadFailed');
      
      // Add helpful hints based on error type
      if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
        errorMessage += `\n\n📱 ${t('profile.photo.networkError')}:\n` +
          '• Make sure your device and computer are on the same Wi-Fi network\n' +
          '• Check if the server is running (npm start in server folder)\n' +
          `• Try the "${t('profile.diagnostics.testApi')}" button above for diagnostics`;
      } else if (error.message?.includes('401')) {
        errorMessage += `\n\n🔐 ${t('profile.photo.authError')}:\n` +
          '• Your session may have expired\n' +
          '• Try logging out and back in';
      } else if (error.message?.includes('413')) {
        errorMessage += `\n\n📦 ${t('profile.photo.sizeError')}:\n` +
          '• Image exceeds 5MB limit\n' +
          '• Try selecting a smaller image';
      }
      
      Alert.alert(t('profile.photo.uploadFailed'), errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const u = dashboardData?.user;
  const name = u?.displayName || user?.displayName || 'Rider';
  const photo = u?.photoURL || user?.photoURL;
  const level = u?.level || 1;
  const xp = u?.xp || 0;
  const prev = LEVEL_THRESHOLDS[level - 1] || 0;
  const next = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const pct = next > prev ? Math.max(0, Math.min(1, (xp - prev) / (next - prev))) : 1;
  const unlockedCount = achievements.filter(
    (a: any) => a.unlocked === true || (Array.isArray(a.tiers) && a.tiers.some((x: any) => x.unlocked === true))
  ).length;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]!.toUpperCase()).join('') || 'W';
  const bike = defaultVehicle;
  const rows = [
    { label: 'Ride history', meta: String(u?.totalTrips ?? ''), href: '/(tabs)/log' },
    { label: 'Gallery', meta: '', href: '/gallery' },
    { label: 'Badges', meta: `${unlockedCount} of ${achievements.length}`, href: '/badges' },
    { label: 'Garage', meta: String(vehicles.length), href: '/manage-vehicles' },
    { label: 'Settings', meta: '', href: '/settings' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dwTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={[styles.dwRound, shadow(d, 8), { backgroundColor: d.surface }]}
          >
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/edit-profile')}
            accessibilityRole="button"
            style={[styles.dwPill, shadow(d, 8), { backgroundColor: d.surface }]}
          >
            <Text style={[styles.dwPillText, { color: d.ink }]}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dwHeader}>
          <TouchableOpacity
            onPress={handleChangePhoto}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            style={styles.dwAvatar}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.dwAvatarImg} />
            ) : (
              <Text style={styles.dwAvatarText}>{initials}</Text>
            )}
            {uploading && (
              <View style={styles.dwUploading}>
                <ActivityIndicator color={AMBER} />
              </View>
            )}
            <View style={[styles.dwLevel, { borderColor: d.bg }]}>
              <Text style={styles.dwLevelText}>Lv {level}</Text>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.dwName, { color: d.ink }]} numberOfLines={2}>{name}</Text>
            <Text style={[styles.dwSub, { color: d.ink2 }]}>
              {t('home.explorerRank')}
              {(user as any)?.country ? ` · ${(user as any).country}` : ''}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/manage-vehicles')}
          accessibilityRole="button"
          accessibilityLabel="Your vehicle"
          style={styles.dwBike}
        >
          <Text style={styles.dwBikeEyebrow}>{bike ? `On ${bike.name || bike.model}` : 'Your garage'}</Text>
          <Text style={styles.dwBikeKm}>
            {Math.round(u?.totalDistance || 0).toLocaleString()}
            <Text style={styles.dwBikeUnit}> km</Text>
          </Text>
          <Text style={styles.dwBikeSub}>
            {u?.totalTrips ?? 0} rides · top {Math.round(u?.topSpeed || 0)} km/h
          </Text>
          <View style={styles.dwBikeLane} />
          {bike?.photoURL ? <Image source={{ uri: bike.photoURL }} style={styles.dwBikeImg} resizeMode="contain" /> : null}
        </TouchableOpacity>

        <View style={styles.dwLevelBlock}>
          <View style={styles.dwLevelRow}>
            <Text style={[styles.dwLevelTitle, { color: d.ink }]}>Level {level}</Text>
            <Text style={[styles.dwMono, { color: d.ink2 }]}>{Math.max(0, next - xp).toLocaleString()} XP to go</Text>
          </View>
          <View style={[styles.dwTrack, { backgroundColor: d.surface2 }]}>
            <View style={[styles.dwFill, { width: `${pct * 100}%` }]} />
          </View>
        </View>

        <View style={styles.dwRows}>
          {rows.map((r) => (
            <TouchableOpacity
              key={r.label}
              onPress={() => router.push(r.href as never)}
              accessibilityRole="button"
              style={[styles.dwRow, { borderTopColor: d.line }]}
            >
              <Text style={[styles.dwRowLabel, { color: d.ink }]}>{r.label}</Text>
              <Text style={[styles.dwMono, { color: d.ink2 }]}>{r.meta}</Text>
              <Icon name="chevron" size={18} color={d.ink2} stroke={2} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  dwTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  dwRound: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dwPill: { height: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dwPillText: { fontFamily: F.extra, fontSize: 14 },
  dwHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, marginTop: 20 },
  dwAvatar: { width: 80, height: 80, borderRadius: 28, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  dwAvatarImg: { width: 80, height: 80, borderRadius: 28 },
  dwAvatarText: { fontFamily: F.black, fontSize: 28, color: AMBER },
  dwUploading: { ...StyleSheet.absoluteFillObject, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  dwLevel: { position: 'absolute', right: -8, bottom: -6, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: AMBER, borderWidth: 3, justifyContent: 'center' },
  dwLevelText: { fontFamily: F.monoBold, fontSize: 11, color: INK },
  dwName: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  dwSub: { fontFamily: F.regular, fontSize: 13 },
  dwBike: { marginHorizontal: 16, marginTop: 28, height: 176, borderRadius: 28, backgroundColor: '#161513', padding: 18, overflow: 'visible' },
  dwBikeEyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#A29B8D' },
  dwBikeKm: { fontFamily: F.monoBold, fontSize: 38, lineHeight: 44, color: AMBER, letterSpacing: -0.8, marginTop: 4 },
  dwBikeUnit: { fontSize: 15, color: '#F2EEE5' },
  dwBikeSub: { fontFamily: F.regular, fontSize: 12, color: '#A29B8D' },
  dwBikeLane: { position: 'absolute', right: 12, bottom: 26, width: 190, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(245,165,36,0.5)' },
  dwBikeImg: { position: 'absolute', right: -6, top: -58, width: 236, height: 236 },
  dwLevelBlock: { marginHorizontal: 20, marginTop: 22, gap: 8 },
  dwLevelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dwLevelTitle: { fontFamily: F.extra, fontSize: 13 },
  dwMono: { fontFamily: F.monoSemi, fontSize: 13 },
  dwTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  dwFill: { height: 8, backgroundColor: AMBER },
  dwRows: { marginHorizontal: 20, marginTop: 20 },
  dwRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 50, borderTopWidth: 1 },
  dwRowLabel: { flex: 1, fontFamily: F.extra, fontSize: 16 },
});
