import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUserData } from '../hooks/useUserData';
import { getCurrentApiUrl, getAuthToken } from '../services/api';
import { testApiConnection, printDiagnostics } from '../utils/apiDiagnostics';

export default function ProfileScreen() {
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
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.photo.permissionTitle'), t('profile.photo.permissionMsg'));
        return;
      }

      // Pick image
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Image source={require('../assets/images/2025-09-26/Q6avvC9L6S.png')} style={styles.headerIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.myProfile')}</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerButton}>
          <Image source={require('../assets/images/2025-09-26/itjep5JQ04.png')} style={styles.headerIcon} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Avatar + Name */}
        <View style={styles.profileTop}>
          <View style={styles.avatarContainer}>
            <Image
              source={
                dashboardData?.user?.photoURL || user?.photoURL
                  ? { uri: dashboardData?.user?.photoURL || user?.photoURL }
                  : require('../assets/images/2025-09-26/i2yG8AHX5c.png')
              }
              style={styles.avatar}
            />
            <TouchableOpacity 
              style={styles.changePhotoButton} 
              onPress={handleChangePhoto}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="camera-alt" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>
            {dashboardData?.user?.displayName || user?.displayName || 'User'}
          </Text>
          <Text style={styles.rank}>{t('home.explorerRank')}</Text>

          <View style={styles.editRow}>
            <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/settings')}>
              <Text style={styles.editBtnText}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('common.distance')}</Text>
            <Text style={styles.statValue}>{formatDistance(dashboardData?.user?.totalDistance || 0)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('common.time')}</Text>
            <Text style={styles.statValue}>{formatTime(dashboardData?.user?.totalTime || 0)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('journeyDetail.topSpeed')}</Text>
            <Text style={styles.statValue}>{(dashboardData?.user?.topSpeed || 0).toFixed(0)} {t('units.kmh')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('home.badges')}</Text>
            <Text style={styles.statValue}>{(achievements || []).filter(a => a.unlocked).length}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ marginTop: 24, gap: 12 }}>
          {/* Debug: API Connection Test */}
          {__DEV__ && (
            <TouchableOpacity style={[styles.actionItem, { backgroundColor: '#FFF3CD', borderColor: '#FFC107' }]} onPress={runDiagnostics}>
              <Text style={[styles.actionTitle, { color: '#856404' }]}>🔧 {t('profile.diagnostics.testApi')}</Text>
              <Text style={[styles.actionSubtitle, { color: '#856404' }]}>{t('profile.diagnostics.debugSub')}</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/(tabs)/log')}>
            <Text style={styles.actionTitle}>{t('profile.rideHistory')}</Text>
            <Text style={styles.actionSubtitle}>{t('profile.rideHistorySub')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/(tabs)/leaderboard')}>
            <Text style={styles.actionTitle}>{t('leaderboard.title')}</Text>
            <Text style={styles.actionSubtitle}>{t('profile.leaderboardSub')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 27, paddingBottom: 11,
  },
  headerButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 34, height: 34 },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: '700', color: '#000', marginRight: 34 },
  profileTop: { alignItems: 'center', paddingVertical: 8 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  changePhotoButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  name: { marginTop: 12, fontFamily: 'Space Grotesk', fontSize: 22, fontWeight: '700', color: '#000' },
  rank: { marginTop: 4, fontFamily: 'Space Grotesk', fontSize: 14, color: '#757575' },
  editRow: { marginTop: 12, flexDirection: 'row', gap: 12 },
  editBtn: { backgroundColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  editBtnText: { fontFamily: 'Inter', color: '#374151', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  statCard: {
    flex: 1,
    backgroundColor: Platform.OS === 'android' ? '#FFFFFF' : 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 1, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
        shadowColor: '#000',
      },
    }),
  },
  statLabel: { fontFamily: 'Space Grotesk', fontSize: 12, color: '#000', marginBottom: 8 },
  statValue: { fontFamily: 'Digital Numbers', fontSize: 20, color: '#000' },
  actionItem: { backgroundColor: '#F6F6F6', borderRadius: 12, padding: 16 },
  actionTitle: { fontFamily: 'Space Grotesk', fontSize: 16, fontWeight: '600', color: '#000' },
  actionSubtitle: { fontFamily: 'Space Grotesk', fontSize: 12, color: '#666', marginTop: 4 },
});
