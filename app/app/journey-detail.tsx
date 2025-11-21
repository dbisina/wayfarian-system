import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getCurrentApiUrl, journeyAPI } from '../services/api';
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
  startTime: string;
  endTime?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'PLANNED';
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

  const normalizeDistance = (value: number) => {
    if (!value) return 0;
    // API returns distance in kilometers, use as-is
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

  useEffect(() => {
    const fetchJourneyDetail = async () => {
      if (!journeyId) {
        setError('No journey ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const apiBase = getCurrentApiUrl();
        console.log('Fetching journey from:', `${apiBase}/journey/${journeyId}`);

        const data = await journeyAPI.getJourney(journeyId);

        if (!data?.journey) {
          throw new Error('Invalid response format - missing journey data');
        }

        setJourney(data.journey);
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
    };

    fetchJourneyDetail();
  }, [journeyId]);

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

    updateTimer(); // Update immediately
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [journey]);

  const openPhotoViewer = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const closePhotoViewer = () => {
    setSelectedPhotoIndex(null);
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
          <Text style={styles.backIconText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {journey.title || 'Journey Details'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Journey Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Text style={styles.journeyTitle}>
              {journey.title || 'Untitled Journey'}
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
                    {/* Timeline dot and line */}
                    <View style={styles.timelineMarker}>
                      <View style={[styles.timelineDot, index === 0 && styles.firstDot]} />
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>

                    {/* Content */}
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
          </View>
        )}
      </ScrollView>

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
            
            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closePhotoViewer}
              activeOpacity={0.8}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            {/* Photo Counter */}
            <View style={styles.photoCounter}>
              <Text style={styles.photoCounterText}>
                {selectedPhotoIndex + 1} / {journeyPhotos.length}
              </Text>
            </View>

            {/* Swipeable Photo Gallery */}
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
  backIconText: {
    fontSize: 24,
    color: '#000000',
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
  headerPlaceholder: {
    width: 40,
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
