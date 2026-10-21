import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { COUNTRIES, getCountryByCode } from '../constants/countries';
import { userAPI, getCurrentApiUrl, getAuthToken } from '../services/api';

export default function EditProfileScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, deleteAccount } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<typeof COUNTRIES[0] | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      if (user.countryCode) {
        const country = getCountryByCode(user.countryCode);
        if (country) setSelectedCountry(country);
      }
    }
  }, [user]);

  const filteredCountries = COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    try {
      setSaving(true);
      
      const response = await userAPI.updateProfile({
        displayName: displayName.trim(),
        country: selectedCountry?.name || null,
        countryCode: selectedCountry?.code || null,
      });

      if (response.success) {
        Alert.alert('Success', 'Profile updated successfully!', [
          {
            text: 'OK',
            onPress: async () => {
              await refreshUser?.(response.user);
              router.back();
            },
          },
        ]);
      }
    } catch (error: any) {
      console.error('Update profile error:', error);
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete account', 'This permanently deletes your account and rides. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            router.replace('/(auth)/login');
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete account');
          }
        },
      },
    ]);
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
        
        const uploadResponse = await fetch(`${apiUrl}/user/profile-picture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }

        const response = await uploadResponse.json();

        if (response.success) {
          Alert.alert('Success', 'Profile photo updated successfully!');
          await refreshUser?.(response.user);
        } else {
          throw new Error(response.message || response.error || 'Upload failed');
        }
      }
    } catch (error: any) {
      console.error('Photo upload error:', error);
      Alert.alert('Error', error.message || 'Could not update profile photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const initials = (displayName || user?.displayName || 'W')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  const fields = [
    { label: 'Display name', node: (
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Enter your name"
        placeholderTextColor={d.ink2}
        maxLength={50}
        style={[styles.dwInput, { color: d.ink }]}
      />
    ) },
    { label: 'Home city', help: 'National board', node: (
      <TouchableOpacity onPress={() => setShowCountryPicker(true)} accessibilityRole="button" style={styles.dwSelect}>
        {selectedCountry ? <Image source={selectedCountry.flag} style={styles.dwFlag} /> : null}
        <Text style={[styles.dwInput, { color: selectedCountry ? d.ink : d.ink2, flex: 1 }]} numberOfLines={1}>
          {selectedCountry?.name || 'Select your country'}
        </Text>
        <Icon name="chevron" size={16} color={d.ink2} />
      </TouchableOpacity>
    ) },
    { label: 'Email', help: 'Cannot be changed', node: (
      <Text style={[styles.dwInput, { color: d.ink2 }]} numberOfLines={1}>{user?.email || 'Not set'}</Text>
    ) },
  ];

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <View style={[styles.dwHeader, { paddingTop: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[styles.dwRound, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="close" size={18} color={d.ink} stroke={2.4} />
        </TouchableOpacity>
        <Text style={[styles.dwTitle, { color: d.ink }]}>Edit profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          style={[styles.dwSave, { opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? <ActivityIndicator color={INK} /> : <Text style={styles.dwSaveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.dwCard, shadow(d, 8), { backgroundColor: d.surface }]}>
          <View style={[styles.dwCover, { backgroundColor: d.surface2 }]}>
            <View style={styles.dwChip}>
              <Text style={styles.dwChipText}>What riders see</Text>
            </View>
          </View>
          <View style={styles.dwAvatarWrap}>
            <View style={[styles.dwAvatar, { borderColor: d.surface }]}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.dwAvatarImg} />
              ) : (
                <Text style={styles.dwAvatarText}>{initials}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              style={[styles.dwCam, { borderColor: d.surface }]}
            >
              {uploadingPhoto ? <ActivityIndicator size="small" color={INK} /> : <Icon name="camera" size={15} color={INK} stroke={2.2} />}
            </TouchableOpacity>
          </View>
          <View style={styles.dwWho}>
            <Text style={[styles.dwWhoName, { color: d.ink }]} numberOfLines={1}>{displayName || 'Your name'}</Text>
            <Text style={[styles.dwWhoSub, { color: d.ink2 }]} numberOfLines={1}>
              {selectedCountry?.name || 'Add your country'}
            </Text>
          </View>
        </View>

        {fields.map((f) => (
          <View key={f.label} style={[styles.dwField, { backgroundColor: d.surface, borderColor: d.line }]}>
            <View style={styles.dwFieldHead}>
              <Text style={[styles.dwFieldLabel, { color: d.ink2 }]}>{f.label}</Text>
              {f.help ? <Text style={[styles.dwFieldHelp, { color: d.ink2 }]}>{f.help}</Text> : null}
            </View>
            {f.node}
          </View>
        ))}

        <TouchableOpacity onPress={handleDelete} accessibilityRole="button" style={{ height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
          <Text style={{ fontFamily: F.extra, fontSize: 14, color: d.danger }}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: d.surface }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: d.ink }]}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <MaterialIcons name="close" size={24} color={d.ink} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <MaterialIcons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search countries..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialIcons name="clear" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Country List */}
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryItem}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryPicker(false);
                    setSearchQuery('');
                  }}
                >
                  <Image source={item.flag} style={styles.flagImage} />
                  <Text style={[styles.countryItemText, { color: d.ink }]}>{item.name}</Text>
                  {selectedCountry?.code === item.code && (
                    <MaterialIcons name="check" size={20} color="#6366f1" />
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
  dwHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  dwRound: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dwTitle: { flex: 1, fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  dwSave: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  dwSaveText: { fontFamily: F.black, fontSize: 14, color: INK },
  dwCard: { borderRadius: 28, overflow: 'hidden', height: 236, marginTop: 8 },
  dwCover: { height: 112 },
  dwChip: { position: 'absolute', left: 12, top: 12, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(26,24,20,0.45)', justifyContent: 'center' },
  dwChipText: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: '#FFFDF8' },
  dwAvatarWrap: { position: 'absolute', left: 16, top: 76, width: 72, height: 72 },
  dwAvatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: INK, borderWidth: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dwAvatarImg: { width: 72, height: 72 },
  dwAvatarText: { fontFamily: F.black, fontSize: 26, color: AMBER },
  dwCam: { position: 'absolute', right: -8, bottom: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: AMBER, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  dwWho: { position: 'absolute', left: 16, right: 16, top: 160 },
  dwWhoName: { fontFamily: F.black, fontSize: 20, letterSpacing: -0.4 },
  dwWhoSub: { fontFamily: F.regular, fontSize: 12 },
  dwField: { minHeight: 60, borderRadius: 18, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  dwFieldHead: { flexDirection: 'row', justifyContent: 'space-between' },
  dwFieldLabel: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  dwFieldHelp: { fontFamily: F.regular, fontSize: 11 },
  dwInput: { fontFamily: F.bold, fontSize: 16, padding: 0 },
  dwSelect: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dwFlag: { width: 22, height: 16, resizeMode: 'contain' },
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 16,
    backgroundColor: '#F6F6F6',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  profilePictureSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#F3F4F6',
  },
  changePhotoButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
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
  photoLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter',
    marginBottom: 4,
  },
  photoHelperText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Inter',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Inter',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  readOnlyInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  readOnlyText: {
    fontSize: 16,
    color: '#6B7280',
    fontFamily: 'Inter',
  },
  helperText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Inter',
    marginTop: 6,
  },
  countrySelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedCountryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flagImage: {
    width: 32,
    height: 24,
    marginRight: 12,
    resizeMode: 'contain',
  },
  countryName: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Inter',
  },
  placeholderText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontFamily: 'Inter',
  },
  saveButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Inter',
  },
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
    fontFamily: 'Inter',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
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
    fontFamily: 'Inter',
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
    fontFamily: 'Inter',
    marginLeft: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
  },
});
