import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Modal,
  FlatList,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupJourneyAPI, galleryAPI } from '../services/api';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useSettings } from '../contexts/SettingsContext';
import GroupPhotoTimeline, {
  GroupTimelinePhoto,
  assignMemberColors,
} from '../components/GroupPhotoTimeline';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MemberStat {
  userId: string;
  displayName: string;
  photoURL?: string;
  totalDistance: number;
  totalTime: number;
  avgSpeed: number;
  topSpeed: number;
  status: string;
}

interface GroupSummary {
  id: string;
  title: string;
  description?: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  groupId: string;
  groupName: string;
  groupStats: {
    totalDistance: number;
    totalTime: number;
    duration: number;
    topSpeed: number;
    totalPhotos: number;
    membersCount: number;
  };
  memberStats: MemberStat[];
}

const GroupJourneyDetailScreen = (): React.JSX.Element => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ groupJourneyId: string | string[] }>();
  const groupJourneyId = Array.isArray(params.groupJourneyId)
    ? params.groupJourneyId[0]
    : params.groupJourneyId;

  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [photos, setPhotos] = useState<GroupTimelinePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const { convertDistance, convertSpeed } = useSettings();

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
    });
  };

  const fetchData = useCallback(async () => {
    if (!groupJourneyId) {
      setError('No group journey ID provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [summaryRes, photosRes] = await Promise.all([
        groupJourneyAPI.getSummary(groupJourneyId),
        galleryAPI.getGroupJourneyPhotos(groupJourneyId),
      ]);

      if (summaryRes?.summary) {
        setSummary(summaryRes.summary);
      }

      if (photosRes?.photos) {
        setPhotos(photosRes.photos);
      }
    } catch (err: any) {
      console.error('Error fetching group journey detail:', err);
      setError(err.message || 'Failed to load journey details');
    } finally {
      setLoading(false);
    }
  }, [groupJourneyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memberColors = assignMemberColors(photos.map((p) => p.userId));

  // Hero photo: first photo in timeline
  const heroPhoto = photos.length > 0 ? photos[0] : null;
  const heroUri = heroPhoto
    ? getFirebaseDownloadUrl(heroPhoto.imageUrl) || heroPhoto.imageUrl
    : null;

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#F9A825" />
        <Text style={styles.loadingText}>Loading journey summary...</Text>
      </View>
    );
  }

  if (error || !summary) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error || 'Journey not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {summary.title}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          {heroUri ? (
            <Image
              source={{ uri: heroUri }}
              style={styles.heroImage}
              contentFit="cover"
              blurRadius={8}
            />
          ) : (
            <LinearGradient
              colors={['#F9A825', '#FF8F00']}
              style={styles.heroImage}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.heroOverlay}
          >
            <Text style={styles.heroTitle}>{summary.title}</Text>
            <Text style={styles.heroDate}>{formatDate(summary.startedAt)}</Text>
            <Text style={styles.heroGroup}>{summary.groupName}</Text>
          </LinearGradient>
        </View>

        {/* Group Stats Card */}
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Group Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="navigate-outline" size={20} color="#F9A825" />
              <Text style={styles.statValue}>
                {convertDistance(summary.groupStats.totalDistance)}
              </Text>
              <Text style={styles.statLabel}>Total Distance</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color="#F9A825" />
              <Text style={styles.statValue}>
                {formatTime(summary.groupStats.duration)}
              </Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="camera-outline" size={20} color="#F9A825" />
              <Text style={styles.statValue}>{summary.groupStats.totalPhotos}</Text>
              <Text style={styles.statLabel}>Photos</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={20} color="#F9A825" />
              <Text style={styles.statValue}>{summary.groupStats.membersCount}</Text>
              <Text style={styles.statLabel}>Riders</Text>
            </View>
          </View>
        </View>

        {/* Member Stats Row */}
        {summary.memberStats.length > 0 && (
          <View style={styles.memberSection}>
            <Text style={styles.sectionTitle}>Riders</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.memberScroll}
            >
              {summary.memberStats.map((member) => {
                const color = memberColors[member.userId] || '#F9A825';
                return (
                  <View key={member.userId} style={styles.memberCard}>
                    <View style={[styles.memberAvatarRing, { borderColor: color }]}>
                      {member.photoURL ? (
                        <Image
                          source={{ uri: member.photoURL }}
                          style={styles.memberAvatar}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.memberAvatarPlaceholder, { backgroundColor: color }]}>
                          <Text style={styles.memberInitial}>
                            {(member.displayName || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.displayName}
                    </Text>
                    <Text style={styles.memberStat}>
                      {convertDistance(member.totalDistance)}
                    </Text>
                    <Text style={styles.memberStatLabel}>
                      {formatTime(member.totalTime)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Photo Timeline */}
        <View style={styles.timelineSection}>
          <View style={styles.timelineSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Photo Timeline</Text>
            <Text style={styles.photoCount}>
              {photos.length} {photos.length === 1 ? 'moment' : 'moments'}
            </Text>
          </View>
          <GroupPhotoTimeline
            photos={photos}
            onPhotoPress={(index) => setSelectedPhotoIndex(index)}
            memberColors={memberColors}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Full-screen Photo Viewer Modal */}
      <Modal
        visible={selectedPhotoIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhotoIndex(null)}
      >
        <View style={styles.viewerContainer}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setSelectedPhotoIndex(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {selectedPhotoIndex !== null && (
            <>
              <FlatList
                data={photos}
                horizontal
                pagingEnabled
                initialScrollIndex={selectedPhotoIndex}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(
                    e.nativeEvent.contentOffset.x / SCREEN_WIDTH
                  );
                  setSelectedPhotoIndex(idx);
                }}
                renderItem={({ item }) => {
                  const uri =
                    getFirebaseDownloadUrl(item.imageUrl) || item.imageUrl;
                  return (
                    <View style={styles.viewerSlide}>
                      {uri && (
                        <Image
                          source={{ uri }}
                          style={styles.viewerImage}
                          contentFit="contain"
                        />
                      )}
                    </View>
                  );
                }}
              />
              <View style={styles.viewerInfo}>
                <Text style={styles.viewerName}>
                  {photos[selectedPhotoIndex]?.userName}
                </Text>
                {photos[selectedPhotoIndex]?.takenAt && (
                  <Text style={styles.viewerTime}>
                    {new Date(photos[selectedPhotoIndex].takenAt).toLocaleTimeString(
                      'en-US',
                      { hour: '2-digit', minute: '2-digit' }
                    )}
                  </Text>
                )}
              </View>
              <Text style={styles.viewerCounter}>
                {selectedPhotoIndex + 1} / {photos.length}
              </Text>
            </>
          )}
        </View>
      </Modal>
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
  // Hero Section
  heroSection: {
    height: 200,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 20,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  heroDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  heroGroup: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9A825',
    fontFamily: 'Space Grotesk',
    marginTop: 4,
  },
  // Stats Card
  statsCard: {
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statItem: {
    width: '25%',
    alignItems: 'center',
    padding: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  // Member Section
  memberSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  memberScroll: {
    gap: 16,
  },
  memberCard: {
    alignItems: 'center',
    width: 80,
  },
  memberAvatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  memberName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3E4751',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  memberStat: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  memberStatLabel: {
    fontSize: 10,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  // Timeline Section
  timelineSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  timelineSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  photoCount: {
    fontSize: 14,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  // Photo Viewer Modal
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerSlide: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.2,
  },
  viewerInfo: {
    position: 'absolute',
    bottom: 80,
    left: 20,
  },
  viewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  viewerTime: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  viewerCounter: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Space Grotesk',
  },
});

export default GroupJourneyDetailScreen;
