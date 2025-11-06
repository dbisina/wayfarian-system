import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { groupAPI } from '../services/api';
import * as ImagePicker from 'expo-image-picker';

export default function NewGroupScreen() {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    try {
      const result = await groupAPI.createGroup({
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
        isPrivate,
      });

      const groupId = result?.group?.id || result?.id;
      if (!groupId) {
        throw new Error('No group id returned');
      }

      // If a cover image was selected, upload it now
      if (coverUri) {
        try {
          console.log('[Group Cover] Uploading cover image:', coverUri);
          const result = await groupAPI.uploadGroupCover(groupId, coverUri);
          console.log('[Group Cover] Upload successful:', result?.imageUrl);
        } catch (e: any) {
          console.error('[Group Cover] Upload failed:', e?.message || e);
          Alert.alert(
            'Cover Upload Failed',
            'The group was created successfully, but the cover photo failed to upload. You can try uploading it again from the group settings.',
            [{ text: 'OK' }]
          );
          // Don't block group creation if cover upload fails
        }
      }

      // Navigate to group details first (leader can then start a journey)
      router.replace(`/group-detail?groupId=${groupId}`);
    } catch (e: any) {
      console.error('Create group failed:', e);
      Alert.alert('Error', e?.message || 'Failed to create group');
    }
  };

  const handleUploadPhoto = () => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need access to your photos to set a cover.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.length) {
        setCoverUri(result.assets[0].uri);
      }
    })();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          {/* Group Name Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Group Name"
              placeholderTextColor="#999999"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
            />
          </View>

          {/* Group Description Input */}
          <View style={styles.descriptionContainer}>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Group Description (Optional)"
              placeholderTextColor="#999999"
              value={groupDescription}
              onChangeText={setGroupDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={200}
            />
          </View>

          {/* Private Group Toggle */}
          <View style={styles.toggleContainer}>
            <Text style={styles.toggleLabel}>Private Group</Text>
            <TouchableOpacity
              style={[styles.toggle, isPrivate && styles.toggleActive]}
              onPress={() => setIsPrivate(!isPrivate)}
            >
              <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>

          {/* Group Cover Photo Section */}
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionTitle}>Group Cover Photo</Text>
            
            {coverUri ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: coverUri }} style={styles.coverPreview} />
                <TouchableOpacity 
                  style={styles.changePhotoButton} 
                  onPress={handleUploadPhoto}
                >
                  <MaterialIcons name="edit" size={20} color="#FFFFFF" />
                  <Text style={styles.changePhotoText}>Change Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.uploadContainer}>
                <View style={styles.uploadArea}>
                  <MaterialIcons name="add-photo-alternate" size={48} color="#007AFF" />
                  <Text style={styles.uploadTitle}>Upload Cover Photo</Text>
                  <Text style={styles.uploadSubtitle}>Add a cover photo to your group</Text>
                  
                  <TouchableOpacity style={styles.uploadButton} onPress={handleUploadPhoto}>
                    <Text style={styles.uploadButtonText}>Choose Photo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Create Group Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity 
          style={[styles.createButton, !groupName.trim() && styles.createButtonDisabled]}
          onPress={handleCreateGroup}
          disabled={!groupName.trim()}
        >
          <Text style={[styles.createButtonText, !groupName.trim() && styles.createButtonTextDisabled]}>
            Create Group
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#F6F6F6',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    paddingHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: '#C4C4C4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
  },
  descriptionContainer: {
    marginBottom: 30,
  },
  descriptionInput: {
    backgroundColor: '#C4C4C4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
    minHeight: 120,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  toggle: {
    width: 60,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#007AFF',
  },
  toggleThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toggleThumbActive: {
    transform: [{translateX: 28}],
  },
  photoSection: {
    marginBottom: 40,
  },
  photoSectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins',
    marginBottom: 20,
  },
  uploadContainer: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 40,
  },
  uploadArea: {
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins',
    marginBottom: 8,
    marginTop: 12,
  },
  uploadSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Poppins',
    marginBottom: 20,
    textAlign: 'center',
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
  },
  previewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  coverPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  changePhotoButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    marginLeft: 6,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#F6F6F6',
  },
  createButton: {
    backgroundColor: '#4A5568',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#C4C4C4',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
  },
  createButtonTextDisabled: {
    color: '#999999',
  },
});
