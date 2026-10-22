import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar, ActivityIndicator, Modal, FlatList, Alert } from 'react-native';
import TextInput from '../../components/dw/DWTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../../constants/design';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { COUNTRIES, getCountryByCode } from '../../constants/countries';
import { LANGUAGES, saveLanguagePreference } from '../../i18n';
import { userAPI, getCurrentApiUrl, getAuthToken } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundLocationDisclosureModal from '../../components/BackgroundLocationDisclosureModal';


export default function ProfileSetupScreen() {
  const { t, i18n } = useTranslation();
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, completeProfileSetup, firebaseUser } = useAuth();
  const { units, setUnits } = useSettings();
  
  // Form state
  const [displayName, setDisplayName] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<typeof COUNTRIES[0] | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]);
  const [selectedUnits, setSelectedUnits] = useState<'km' | 'mi'>(units);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  
  // UI state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);

  // Pre-fill from user data
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      if (user.countryCode) {
        const country = getCountryByCode(user.countryCode);
        if (country) setSelectedCountry(country);
      }
      if (user.photoURL) {
        setProfilePhotoUri(user.photoURL);
      }
    } else if (firebaseUser) {
      // Fallback to Firebase user data
      setDisplayName(firebaseUser.displayName || '');
      if (firebaseUser.photoURL) {
        setProfilePhotoUri(firebaseUser.photoURL);
      }
    }
  }, [user, firebaseUser]);

  const filteredCountries = COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(countrySearchQuery.toLowerCase()) ||
    country.code.toLowerCase().includes(countrySearchQuery.toLowerCase())
  );

  const handleLanguageChange = async (language: typeof LANGUAGES[0]) => {
    setSelectedLanguage(language);
    await i18n.changeLanguage(language.code);
    await saveLanguagePreference(language.code);
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
        setUploadingPhoto(true);
        
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

        const token = await getAuthToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const apiUrl = getCurrentApiUrl();
        const uploadResponse = await fetch(`${apiUrl}/user/profile-picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Upload failed');
        }

        const response = await uploadResponse.json();
        if (response.success && response.user?.photoURL) {
          setProfilePhotoUri(response.user.photoURL);
          await refreshUser?.(response.user);
        }
      }
    } catch (error: any) {
      if (__DEV__) console.error('Photo upload error:', error);
      const message = error?.message === 'Not authenticated' 
        ? t('profileSetup.errors.notAuthenticated', 'Please sign in again to upload your photo.')
        : t('profileSetup.errors.uploadFailed', 'Failed to upload photo. Please try again.');
      Alert.alert(t('alerts.error'), message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleContinue = async () => {
    try {
      setSaving(true);

      // Save profile data
      await userAPI.updateProfile({
        displayName: displayName.trim() || 'Wayfarian User',
        country: selectedCountry?.name || null,
        countryCode: selectedCountry?.code || null,
      });

      // Save units preference
      setUnits(selectedUnits);

      // Mark profile setup as complete
      await completeProfileSetup();

      // Check if disclosure already accepted (e.g. re-onboarding edge case)
      const alreadyAccepted = await AsyncStorage.getItem('bg_location_disclosure_accepted_v1');
      if (alreadyAccepted) {
        router.replace('/(tabs)');
      } else {
        // Show background location disclosure before entering the app
        setShowDisclosureModal(true);
      }
    } catch (error) {
      if (__DEV__) console.error('Profile setup error:', error);
      Alert.alert(t('alerts.error'), t('profileSetup.errors.saveFailed', 'Failed to save profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisclosureAccept = async () => {
    await AsyncStorage.setItem('bg_location_disclosure_accepted_v1', '1');
    setShowDisclosureModal(false);
    // Prompt to add first vehicle during onboarding
    router.replace('/add-vehicle?fromOnboarding=1');
  };

  const handleDisclosureDecline = () => {
    setShowDisclosureModal(false);
    // Skip disclosure — still allow entry but prompt vehicle add
    router.replace('/add-vehicle?fromOnboarding=1');
  };

  const initials = (displayName || 'W').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingHorizontal: 16, paddingBottom: 130, gap: 18 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={[styles.round, { backgroundColor: d.surface }]}
          >
            <Ionicons name="chevron-back" size={22} color={d.ink} />
          </TouchableOpacity>
          <View style={styles.bars} accessibilityLabel="Step 2 of 2">
            <View style={styles.bar} />
            <View style={styles.bar} />
          </View>
          <TouchableOpacity onPress={handleContinue} accessibilityRole="button" style={{ padding: 10 }}>
            <Text style={[styles.skip, { color: d.ink2 }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.h1, { color: d.ink }]}>{t('profileSetup.title', 'Set up your profile')}</Text>

        <View style={styles.avatarRow}>
          <TouchableOpacity
            onPress={handleChangePhoto}
            disabled={uploadingPhoto}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            style={[styles.avatar, { borderColor: d.line2 }]}
          >
            {profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
            {uploadingPhoto && (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color={AMBER} />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.eyebrow, { color: d.ink2 }]}>Your name on boards</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={d.ink2}
              style={[styles.nameInput, { color: d.ink }]}
              maxLength={50}
            />
          </View>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity
            onPress={() => setShowCountryPicker(true)}
            accessibilityRole="button"
            style={[styles.country, { backgroundColor: d.surface, borderColor: d.line }]}
          >
            <Text style={[styles.eyebrow, { color: d.ink2 }]}>Country</Text>
            <Text style={[styles.countryName, { color: d.ink }]} numberOfLines={1}>
              {selectedCountry?.name || 'Choose'}
            </Text>
          </TouchableOpacity>
          <View style={[styles.units, { backgroundColor: d.surface2 }]} accessibilityRole="radiogroup">
            {(['km', 'mi'] as const).map((u) => {
              const on = selectedUnits === u;
              return (
                <TouchableOpacity
                  key={u}
                  onPress={() => setSelectedUnits(u)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.unit, on && { backgroundColor: d.surface }]}
                >
                  <Text style={{ fontFamily: on ? F.black : F.bold, fontSize: 15, color: on ? d.ink : d.ink2 }}>{u}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.eyebrow, { color: d.ink2 }]}>Language</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {LANGUAGES.map((l) => {
              const on = selectedLanguage.code === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  onPress={() => handleLanguageChange(l)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, on ? { backgroundColor: d.ink } : { borderWidth: 1.5, borderColor: d.line2 }]}
                >
                  <Text style={{ fontFamily: F.extra, fontSize: 13, color: on ? d.bg : d.ink }}>{l.nativeName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={handleContinue}
        disabled={saving}
        accessibilityRole="button"
        style={[styles.cta, { bottom: Math.max(30, insets.bottom + 10), opacity: saving ? 0.6 : 1 }]}
      >
        {saving ? (
          <ActivityIndicator color={INK} />
        ) : (
          <>
            <Icon name="nav" size={18} color={INK} fill />
            <Text style={styles.ctaText}>Start riding</Text>
          </>
        )}
      </TouchableOpacity>

      <BackgroundLocationDisclosureModal
        visible={showDisclosureModal}
        onAccept={handleDisclosureAccept}
        onDecline={handleDisclosureDecline}
      />

      <Modal visible={showCountryPicker} animationType="slide" transparent onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: d.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: d.ink }]}>Select country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Icon name="close" size={22} color={d.ink} stroke={2.2} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={countrySearchQuery}
              onChangeText={setCountrySearchQuery}
              placeholder="Search countries"
              placeholderTextColor={d.ink2}
              autoCapitalize="none"
              style={[styles.search, { backgroundColor: d.surface2, color: d.ink }]}
            />
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryRow, { borderTopColor: d.line }]}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryPicker(false);
                    setCountrySearchQuery('');
                  }}
                >
                  <Image source={item.flag} style={styles.flag} />
                  <Text style={[styles.countryRowText, { color: d.ink }]}>{item.name}</Text>
                  {selectedCountry?.code === item.code && <Ionicons name="checkmark" size={20} color={AMBER} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: AMBER },
  skip: { fontFamily: F.extra, fontSize: 14 },
  h1: { fontFamily: F.black, fontSize: 30, lineHeight: 32, letterSpacing: -0.9, marginHorizontal: 8 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 4 },
  avatar: { width: 72, height: 72, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: INK, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 72, height: 72 },
  avatarText: { fontFamily: F.black, fontSize: 24, color: AMBER },
  avatarBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  nameInput: { fontFamily: F.extra, fontSize: 18, padding: 0 },
  grid: { flexDirection: 'row', gap: 10 },
  country: { flex: 1.4, height: 60, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
  countryName: { fontFamily: F.extra, fontSize: 16 },
  units: { flex: 1, height: 60, borderRadius: 20, padding: 5, flexDirection: 'row' },
  unit: { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: 16, right: 16, height: 56, borderRadius: 28, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { fontFamily: F.black, fontSize: 16, color: INK },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { maxHeight: '80%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontFamily: F.black, fontSize: 20 },
  search: { height: 46, borderRadius: 14, paddingHorizontal: 14, fontFamily: F.regular, fontSize: 15, marginBottom: 6 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderTopWidth: 1 },
  flag: { width: 26, height: 18, resizeMode: 'contain' },
  countryRowText: { flex: 1, fontFamily: F.bold, fontSize: 15 },
});
