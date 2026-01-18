import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { COUNTRIES, getCountryByCode } from '../../constants/countries';
import { LANGUAGES, saveLanguagePreference } from '../../i18n';
import { userAPI, getCurrentApiUrl, getAuthToken } from '../../services/api';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ProfileSetupScreen() {
  const { t, i18n } = useTranslation();
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

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
    } catch (error) {
      console.error('Photo upload error:', error);
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
      
      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Profile setup error:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View
        style={styles.backgroundGradient}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('profileSetup.title', 'Welcome!')}</Text>
            <Text style={styles.subtitle}>
              {t('profileSetup.subtitle', "Let's set up your profile")}
            </Text>
          </View>

          {/* Profile Photo */}
          <View style={styles.glassCard}>
            <BlurView intensity={40} tint="light" style={styles.blurContainer}>
              <View style={styles.cardContent}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="person-circle-outline" size={24} color="#757575" />
                  <Text style={styles.sectionTitle}>
                    {t('profileSetup.profilePhoto', 'Profile Photo')}
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.avatarContainer} 
                  onPress={handleChangePhoto}
                  disabled={uploadingPhoto}
                >
                  {profilePhotoUri ? (
                    <Image source={{ uri: profilePhotoUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="camera" size={32} color="#9CA3AF" />
                    </View>
                  )}
                  <View style={styles.cameraButton}>
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={16} color="#fff" />
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>

          {/* Display Name */}
          <View style={styles.glassCard}>
            <BlurView intensity={40} tint="light" style={styles.blurContainer}>
              <View style={styles.cardContent}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="text-outline" size={24} color="#757575" />
                  <Text style={styles.sectionTitle}>
                    {t('profileSetup.displayName', 'Display Name')}
                  </Text>
                </View>
                
                <TextInput
                  style={styles.textInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t('profileSetup.enterName', 'Enter your name')}
                  placeholderTextColor="#9E9E9E"
                  maxLength={50}
                />
              </View>
            </BlurView>
          </View>

          {/* Language */}
          <View style={styles.glassCard}>
            <BlurView intensity={40} tint="light" style={styles.blurContainer}>
              <View style={styles.cardContent}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="language-outline" size={24} color="#757575" />
                  <Text style={styles.sectionTitle}>
                    {t('profileSetup.language', 'Language')}
                  </Text>
                </View>
                
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.languageScroll}
                >
                  {LANGUAGES.map((language) => (
                    <TouchableOpacity
                      key={language.code}
                      style={[
                        styles.languageOption,
                        selectedLanguage.code === language.code && styles.languageOptionActive
                      ]}
                      onPress={() => handleLanguageChange(language)}
                    >
                      <Text style={styles.languageFlag}>{language.flag}</Text>
                      <Text style={styles.languageName}>{language.nativeName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </BlurView>
          </View>

          {/* Units */}
          <View style={styles.glassCard}>
            <BlurView intensity={40} tint="light" style={styles.blurContainer}>
              <View style={styles.cardContent}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="speedometer-outline" size={24} color="#757575" />
                  <Text style={styles.sectionTitle}>
                    {t('profileSetup.units', 'Units')}
                  </Text>
                </View>
                
                <View style={styles.unitsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.unitOption,
                      selectedUnits === 'km' && styles.unitOptionActive
                    ]}
                    onPress={() => setSelectedUnits('km')}
                  >
                    <Ionicons 
                      name={selectedUnits === 'km' ? 'checkmark-circle' : 'ellipse-outline'} 
                      size={24} 
                      color={selectedUnits === 'km' ? '#F9A825' : '#757575'} 
                    />
                    <View style={styles.unitTextContainer}>
                      <Text style={styles.unitLabel}>
                        {t('settings.metricUnits', 'Metric')}
                      </Text>
                      <Text style={styles.unitDescription}>km, km/h</Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.unitOption,
                      selectedUnits === 'mi' && styles.unitOptionActive
                    ]}
                    onPress={() => setSelectedUnits('mi')}
                  >
                    <Ionicons 
                      name={selectedUnits === 'mi' ? 'checkmark-circle' : 'ellipse-outline'} 
                      size={24} 
                      color={selectedUnits === 'mi' ? '#F9A825' : '#757575'} 
                    />
                    <View style={styles.unitTextContainer}>
                      <Text style={styles.unitLabel}>
                        {t('settings.imperialUnits', 'Imperial')}
                      </Text>
                      <Text style={styles.unitDescription}>mi, mph</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          </View>

          {/* Country */}
          <View style={styles.glassCard}>
            <BlurView intensity={40} tint="light" style={styles.blurContainer}>
              <View style={styles.cardContent}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="globe-outline" size={24} color="#757575" />
                  <Text style={styles.sectionTitle}>
                    {t('profileSetup.country', 'Country')}
                  </Text>
                </View>
                
                <TouchableOpacity
                  style={styles.countrySelector}
                  onPress={() => setShowCountryPicker(true)}
                >
                  {selectedCountry ? (
                    <View style={styles.selectedCountryRow}>
                      <Image source={selectedCountry.flag} style={styles.flagImage} />
                      <Text style={styles.countryName}>{selectedCountry.name}</Text>
                    </View>
                  ) : (
                    <Text style={styles.placeholderText}>
                      {t('profileSetup.selectCountry', 'Select your country')}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={20} color="#757575" />
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[styles.continueButton, saving && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#1a1a2e" size="small" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>
                  {t('profileSetup.continue', 'Continue')}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Skip link */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleContinue}
            disabled={saving}
          >
            <Text style={styles.skipText}>
              {t('profileSetup.skip', 'Skip for now')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('profileSetup.selectCountry', 'Select Country')}
              </Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={countrySearchQuery}
                onChangeText={setCountrySearchQuery}
                placeholder={t('profileSetup.searchCountries', 'Search countries...')}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryItem}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryPicker(false);
                    setCountrySearchQuery('');
                  }}
                >
                  <Image source={item.flag} style={styles.flagImage} />
                  <Text style={styles.countryItemText}>{item.name}</Text>
                  {selectedCountry?.code === item.code && (
                    <Ionicons name="checkmark" size={20} color="#F9A825" />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundGradient: {
    flex: 1,
    width: screenWidth,
    minHeight: screenHeight,
    backgroundColor: '#FFFFFF', // Fallback
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
  },
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  blurContainer: {
    backgroundColor: 'transparent',
  },
  cardContent: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  avatarContainer: {
    alignSelf: 'center',
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#E0E0E0',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  languageScroll: {
    marginHorizontal: -8,
  },
  languageOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageOptionActive: {
    borderColor: '#F9A825',
    backgroundColor: 'rgba(249, 168, 37, 0.1)',
  },
  languageFlag: {
    fontSize: 24,
    marginBottom: 4,
  },
  languageName: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
  },
  unitsContainer: {
    gap: 12,
  },
  unitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  unitOptionActive: {
    borderColor: '#F9A825',
    backgroundColor: 'rgba(249, 168, 37, 0.1)',
  },
  unitTextContainer: {
    flex: 1,
  },
  unitLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  unitDescription: {
    fontSize: 14,
    color: '#757575',
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectedCountryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flagImage: {
    width: 28,
    height: 20,
    marginRight: 12,
    resizeMode: 'contain',
  },
  countryName: {
    fontSize: 16,
    color: '#000000',
  },
  placeholderText: {
    fontSize: 16,
    color: '#757575',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F9A825',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  skipText: {
    fontSize: 14,
    color: '#757575',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  countryItemText: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    marginLeft: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 20,
  },
});
