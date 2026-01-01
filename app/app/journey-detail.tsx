import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  FlatList,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getCurrentApiUrl, journeyAPI, galleryAPI } from '../services/api';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useSettings } from '../contexts/SettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface JourneyPhoto {
  id: string;
  firebasePath: string;
  takenAt: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  thumbnailPath?: string;
}

interface JourneyDetail {
  id: string;
  title: string;
  customTitle?: string | null;
  startTime: string;
  endTime?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'PLANNED' | 'CANCELLED';
  totalDistance: number;
  totalTime: number;
  avgSpeed: number;
  topSpeed: number;
  vehicle?: string;
  startLatitude: number;
  startLongitude: number;
  endLatitude?: number;
  endLongitude?: number;
  photos?: JourneyPhoto[];
  isHidden?: boolean;
}

const JourneyDetailScreen = (): React.JSX.Element => {
  const router = useRouter();
  const params = useLocalSearchParams<{ journeyId: string | string[] }>();
  const journeyId = Array.isArray(params.journeyId) ? params.journeyId[0] : params.journeyId;
  
  const [journey, setJourney] = useState<JourneyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [liveTime, setLiveTime] = useState<number | null>(null);
  const { convertDistance, convertSpeed } = useSettings();

  // Edit state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const normalizeDistance = (value: number) => {
    if (!value) return 0;
    return value;
  };

  const formatDistance = (km: number) => {
    return convertDistance(normalizeDistance(km));
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const fetchJourneyDetail = useCallback(async () => {
    if (!journeyId) {
      setError('No journey ID provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await journeyAPI.getJourney(journeyId);

      if (!data?.journey) {
        throw new Error('Invalid response format - missing journey data');
      }

      setJourney(data.journey);
      setEditTitle(data.journey.customTitle || data.journey.title || '');
    } catch (err: any) {
      console.error('Error fetching journey details:', err);
      if (err?.status === 401) {
        setError('Session expired. Please sign in again.');
      } else {
        setError(err.message || 'Failed to load journey details');
      }
    } finally {
      setLoading(false);
    }
  }, [journeyId]);

  useEffect(() => {
    fetchJourneyDetail();
  }, [fetchJourneyDetail]);

  // Live timer for active journeys
  useEffect(() => {
    if (!journey || journey.status !== 'ACTIVE') {
      setLiveTime(null);
      return;
    }

    const startTime = new Date(journey.startTime).getTime();
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setLiveTime(elapsed);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [journey]);

  const openPhotoViewer = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const closePhotoViewer = () => {
    setSelectedPhotoIndex(null);
  };

  // Edit journey title
  const handleSaveTitle = async () => {
    if (!journey) return;
    
    setSaving(true);
    try {
      await journeyAPI.updateJourneyPreferences(journey.id, {
        customTitle: editTitle.trim() || null,
      });
      
      setJourney(prev => prev ? { ...prev, customTitle: editTitle.trim() || null, title: editTitle.trim() || prev.title } : null);
      setShowEditModal(false);
      Alert.alert('Success', 'Journey title updated');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update title');
    } finally {
      setSaving(false);
    }
  };

  // Delete journey
  const handleDeleteJourney = () => {
    if (!journey) return;

    if (journey.status === 'ACTIVE') {
      Alert.alert('Cannot Delete', 'Please end the journey first before deleting it.');
      return;
    }

    Alert.alert(
      'Delete Journey',
      'Are you sure you want to permanently delete this journey? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await journeyAPI.deleteJourney(journey.id);
              Alert.alert('Deleted', 'Journey has been deleted');
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete journey');
            }
          },
        },
      ]
    );
  };

  // Add photos to completed journey
  const handleAddPhotos = async () => {
    if (!journey) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery permission is required to add photos');
        return;
      }

      setShowOptionsMenu(false);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingPhoto(true);
        
        let successCount = 0;
        for (const asset of result.assets) {
          try {
            await galleryAPI.uploadPhotoWithProgress(
              asset.uri,
              journey.id,
              () => {} // progress callback
            );
            successCount++;
          } catch (err) {
            console.error('Failed to upload photo:', err);
          }
        }

        if (successCount > 0) {
          Alert.alert('Success', `${successCount} photo${successCount > 1 ? 's' : ''} added to journey`);
          // Refresh journey to show new photos
          await fetchJourneyDetail();
        } else {
          Alert.alert('Error', 'Failed to upload photos');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add photos');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Take new photo and add to journey
  const handleTakePhoto = async () => {
    if (!journey) return;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to take photos');
        return;
      }

      setShowOptionsMenu(false);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingPhoto(true);
        
        try {
          await galleryAPI.uploadPhotoWithProgress(
            result.assets[0].uri,
            journey.id,
            () => {}
          );
          Alert.alert('Success', 'Photo added to journey');
          await fetchJourneyDetail();
        } catch (err) {
          Alert.alert('Error', 'Failed to upload photo');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to take photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#3E4751" />
        <Text style={styles.loadingText}>Loading journey...</Text>
      </View>
    );
  }

  if (error || !journey) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error || 'Journey not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const journeyPhotos = journey.photos ?? [];
  const displayTitle = journey.customTitle || journey.title || 'Untitled Journey';
  const isCompletedOrCancelled = journey.status === 'COMPLETED' || journey.status === 'CANCELLED' || !journey.status;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowOptionsMenu(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="ellipsis-vertical" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Journey Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Text style={styles.journeyTitle}>
              {displayTitle}
            </Text>
            <Text style={styles.journeyDate}>{formatDate(journey.startTime)}</Text>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>📏</Text>
              <Text style={styles.statValue}>{formatDistance(journey.totalDistance)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⏱️</Text>
              <Text style={styles.statValue}>{formatTime(liveTime !== null ? liveTime : journey.totalTime)}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            {journey.avgSpeed > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>⚡</Text>
                <Text style={styles.statValue}>{convertSpeed(journey.avgSpeed)}</Text>
                <Text style={styles.statLabel}>Avg Speed</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🚀</Text>
              <Text style={styles.statValue}>{convertSpeed(journey.topSpeed)}</Text>
              <Text style={styles.statLabel}>Top Speed</Text>
            </View>
          </View>

          {/* Vehicle Badge */}
          {journey.vehicle && (
            <View style={styles.vehicleBadge}>
              <Text style={styles.vehicleIcon}>
                {journey.vehicle === 'bike' ? '🚴' : journey.vehicle === 'car' ? '🚗' : '🏃'}
              </Text>
              <Text style={styles.vehicleText}>{journey.vehicle}</Text>
            </View>
          )}
        </View>

        {/* Add Photos Button for Completed Journeys */}
        {isCompletedOrCancelled && (
          <View style={styles.addPhotosSection}>
            <TouchableOpacity
              style={styles.addPhotosButton}
              onPress={handleAddPhotos}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="images" size={20} color="#fff" />
                  <Text style={styles.addPhotosButtonText}>Add Photos</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.takePhotoButton}
              onPress={handleTakePhoto}
              disabled={uploadingPhoto}
            >
              <Ionicons name="camera" size={20} color="#6366f1" />
              <Text style={styles.takePhotoButtonText}>Take Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Photo Timeline */}
        {journeyPhotos.length > 0 && (
          <View style={styles.timelineSection}>
            <View style={styles.timelineSectionHeader}>
              <Text style={styles.sectionTitle}>Journey Timeline</Text>
              <Text style={styles.photoCount}>{journeyPhotos.length} moments</Text>
            </View>
            <View style={styles.timeline}>
              {journeyPhotos.map((photo, index) => {
                const photoDate = new Date(photo.takenAt);
                const timeDisplay = photoDate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const hasLocation = photo.latitude && photo.longitude;
                const isLast = index >= journeyPhotos.length - 1;

                const photoUri =
                  getFirebaseDownloadUrl(photo.imageUrl || photo.firebasePath) ||
                  photo.imageUrl ||
                  photo.firebasePath;

                return (
                  <View key={photo.id} style={styles.timelineItem}>
                    <View style={styles.timelineMarker}>
                      <View style={[styles.timelineDot, index === 0 && styles.firstDot]} />
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>

                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTime}>{timeDisplay}</Text>
                      <TouchableOpacity
                        style={styles.timelinePhoto}
                        activeOpacity={0.8}
                        onPress={() => openPhotoViewer(index)}
                      >
                        <Image 
                          source={photoUri ? { uri: photoUri } : undefined} 
                          style={styles.timelinePhotoImage}
                          resizeMode="cover"
                        />
                        {index === 0 && (
                          <View style={styles.coverBadge}>
                            <Text style={styles.coverBadgeText}>Cover</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      {hasLocation && (
                        <View style={styles.timelineLocation}>
                          <Text style={styles.locationIcon}>📍</Text>
                          <Text style={styles.locationText}>
                            {photo.latitude?.toFixed(4)}, {photo.longitude?.toFixed(4)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Empty state for no photos */}
        {journeyPhotos.length === 0 && (
          <View style={styles.emptyPhotos}>
            <Text style={styles.emptyPhotosEmoji}>📷</Text>
            <Text style={styles.emptyPhotosText}>No photos from this journey</Text>
            {isCompletedOrCancelled && (
              <Text style={styles.emptyPhotosSubtext}>Add some memories above!</Text>
            )}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsMenu}>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowOptionsMenu(false);
                setShowEditModal(true);
              }}
            >
              <Ionicons name="pencil" size={20} color="#000" />
              <Text style={styles.optionText}>Edit Title</Text>
            </TouchableOpacity>
            
            {isCompletedOrCancelled && (
              <>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={handleAddPhotos}
                >
                  <Ionicons name="images" size={20} color="#000" />
                  <Text style={styles.optionText}>Add Photos</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={handleTakePhoto}
                >
                  <Ionicons name="camera" size={20} color="#000" />
                  <Text style={styles.optionText}>Take Photo</Text>
                </TouchableOpacity>
              </>
            )}
            
            <View style={styles.optionDivider} />
            
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowOptionsMenu(false);
                handleDeleteJourney();
              }}
            >
              <Ionicons name="trash" size={20} color="#E53935" />
              <Text style={[styles.optionText, styles.deleteText]}>Delete Journey</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Title Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>Edit Journey Title</Text>
            <TextInput
              style={styles.editInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Enter journey title"
              placeholderTextColor="#999"
              maxLength={60}
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveTitle}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      {selectedPhotoIndex !== null && journeyPhotos.length > 0 && (
        <Modal
          visible={true}
          transparent={false}
          animationType="fade"
          onRequestClose={closePhotoViewer}
        >
          <View style={styles.photoViewerContainer}>
            <StatusBar barStyle="light-content" />
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closePhotoViewer}
              activeOpacity={0.8}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.photoCounter}>
              <Text style={styles.photoCounterText}>
                {selectedPhotoIndex + 1} / {journeyPhotos.length}
              </Text>
            </View>

            <FlatList
              data={journeyPhotos}
              horizontal
              pagingEnabled
              initialScrollIndex={selectedPhotoIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              renderItem={({ item }) => {
                const sourceUri =
                  getFirebaseDownloadUrl(item.imageUrl || item.firebasePath) ||
                  item.imageUrl ||
                  item.firebasePath;

                return (
                <View style={styles.photoViewerImageContainer}>
                  <Image 
                    source={sourceUri ? { uri: sourceUri } : undefined} 
                    style={styles.photoViewerImage}
                    resizeMode="contain"
                  />
                </View>
                );
              }}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(
                  event.nativeEvent.contentOffset.x / SCREEN_WIDTH
                );
                setSelectedPhotoIndex(index);
              }}
            />
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3E4751',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Space Grotesk',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  scrollView: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoHeader: {
    marginBottom: 20,
  },
  journeyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 8,
  },
  journeyDate: {
    fontSize: 14,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statItem: {
    width: '50%',
    padding: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'center',
  },
  vehicleIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  vehicleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3E4751',
    fontFamily: 'Space Grotesk',
    textTransform: 'capitalize',
  },
  addPhotosSection: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  addPhotosButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  addPhotosButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  takePhotoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6366f1',
    gap: 8,
  },
  takePhotoButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  timelineSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
  },
  timelineSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  photoCount: {
    fontSize: 14,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  timeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  timelineMarker: {
    width: 24,
    alignItems: 'center',
    marginRight: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F4E04D',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  firstDot: {
    backgroundColor: '#4CAF50',
    borderColor: '#2E7D32',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTime: {
    fontSize: 12,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginBottom: 8,
    fontWeight: '600',
  },
  timelinePhoto: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
    position: 'relative',
  },
  timelinePhotoImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#F4E04D',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  coverBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  timelineLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  emptyPhotos: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyPhotosEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyPhotosText: {
    fontSize: 16,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  emptyPhotosSubtext: {
    fontSize: 14,
    color: '#6366f1',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsMenu: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    width: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  optionDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 4,
  },
  deleteText: {
    color: '#E53935',
  },
  editModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 340,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
    textAlign: 'center',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000',
    marginBottom: 24,
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  photoViewerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  photoCounter: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  photoCounterText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  photoViewerImageContainer: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});

export default JourneyDetailScreen;
