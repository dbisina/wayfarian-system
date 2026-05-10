import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useJourney } from '../contexts/JourneyContext';
import { useJourneyStats } from '../hooks/useJourneyState';
import { useSettings } from '../contexts/SettingsContext';
import { journeyAPI } from '../services/api';

interface Props {
  visible: boolean;
  onDone: (journeyId: string | null) => void;
}

export default function JourneyEndModal({ visible, onDone }: Props) {
  const { currentJourney, endJourney, addPhoto } = useJourney();
  const stats = useJourneyStats();
  const { convertDistance, convertSpeed } = useSettings();
  const [title, setTitle] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const journeyId = currentJourney?.id;

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access needed to take photos.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      exif: false,
      base64: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPendingPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handlePickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 5,
    });
    if (!result.canceled && result.assets?.length) {
      setPendingPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (title.trim() && journeyId) {
        try {
          await journeyAPI.updateJourneyPreferences(journeyId, { customTitle: title.trim() });
        } catch (e) {
          console.warn('[JourneyEndModal] Title update failed (non-blocking):', e);
        }
      }
      for (const uri of pendingPhotos) {
        try {
          await addPhoto(uri);
        } catch (e) {
          console.warn('[JourneyEndModal] Photo upload failed:', e);
        }
      }
      const endedJourneyId = await endJourney();
      setPendingPhotos([]);
      setTitle('');
      onDone(endedJourneyId);
    } catch (e) {
      console.error('[JourneyEndModal] Save failed:', e);
      Alert.alert('Error', 'Failed to save journey. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const distStr = convertDistance(stats?.totalDistance || 0);
  const speedStr = convertSpeed(stats?.topSpeed || 0);
  const timeStr = formatTime(Math.floor(stats?.totalTime || 0));

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Handle bar */}
            <View style={styles.handle} />

            <Text style={styles.heading}>Journey Complete</Text>

            {/* Stats summary */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{timeStr}</Text>
                <Text style={styles.statLabel}>Time</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{distStr}</Text>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{speedStr}</Text>
                <Text style={styles.statLabel}>Top Speed</Text>
              </View>
            </View>

            {/* Title input */}
            <Text style={styles.label}>Give it a name</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="My Journey"
              placeholderTextColor="#aaa"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              returnKeyType="done"
            />

            {/* Photos */}
            <Text style={styles.label}>Add Photos</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photosScroll}
              contentContainerStyle={styles.photosContent}
            >
              {pendingPhotos.map((uri, i) => (
                <View key={i} style={styles.photoWrapper}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setPendingPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhoto}>
                <MaterialIcons name="camera-alt" size={22} color="#666" />
                <Text style={styles.addPhotoText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoBtn} onPress={handlePickFromLibrary}>
                <MaterialIcons name="photo-library" size={22} color="#666" />
                <Text style={styles.addPhotoText}>Library</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveBtnText}>Save Journey</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  heading: {
    fontFamily: 'Space Grotesk',
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'Poppins',
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontFamily: 'Space Grotesk',
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#e0e0e0',
  },
  label: {
    fontFamily: 'Space Grotesk',
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    color: '#000',
    marginBottom: 20,
  },
  photosScroll: {
    marginBottom: 24,
  },
  photosContent: {
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#eee',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fafafa',
  },
  addPhotoText: {
    fontFamily: 'Space Grotesk',
    fontSize: 10,
    color: '#666',
  },
  saveBtn: {
    backgroundColor: '#BEFFA7',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
