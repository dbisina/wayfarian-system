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
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AMBER, F, INK, useDW } from '../constants/design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupJourneyAPI, galleryAPI } from '../services/api';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useSettings } from '../contexts/SettingsContext';
import GroupPhotoTimeline, {
  GroupTimelinePhoto,
  assignMemberColors,
} from '../components/GroupPhotoTimeline';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  photoCount?: number;
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

const ExpandableMemberCard = ({
  member,
  color,
  convertDistance,
  convertSpeed,
  formatTime,
}: {
  member: MemberStat;
  color: string;
  convertDistance: (km: number) => string;
  convertSpeed: (kmh: number) => string;
  formatTime: (seconds: number) => string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const dw = useDW();

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <TouchableOpacity
      style={[styles.expandableCard, { backgroundColor: dw.surface2, borderColor: dw.line }]}
      activeOpacity={0.7}
      onPress={toggleExpand}
    >
      {/* Collapsed: Avatar + Name + Distance */}
      <View style={styles.expandableCardHeader}>
        <View style={[styles.expandableAvatarRing, { borderColor: color }]}>
          {member.photoURL ? (
            <Image
              source={{ uri: member.photoURL }}
              style={styles.expandableAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.expandableAvatarPlaceholder, { backgroundColor: color }]}>
              <Text style={styles.expandableInitial}>
                {(member.displayName || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.expandableNameSection}>
          <Text style={[styles.expandableName, { color: dw.ink }]} numberOfLines={1}>
            {member.displayName}
          </Text>
          <Text style={[styles.expandableDistance, { color: dw.ink2 }]}>
            {convertDistance(member.totalDistance)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#757575"
        />
      </View>

      {/* Expanded: Full Stats Grid */}
      {expanded && (
        <View style={styles.expandedStatsGrid}>
          <View style={styles.expandedStatItem}>
            <View style={styles.expandedStatIconContainer}>
              <Ionicons name="navigate-outline" size={14} color="#F9A825" />
            </View>
            <Text style={[styles.expandedStatValue, { color: dw.ink }]}>{convertDistance(member.totalDistance)}</Text>
            <Text style={[styles.expandedStatLabel, { color: dw.ink2 }]}>Distance</Text>
          </View>
          <View style={styles.expandedStatItem}>
            <View style={styles.expandedStatIconContainer}>
              <Ionicons name="time-outline" size={14} color="#F9A825" />
            </View>
            <Text style={[styles.expandedStatValue, { color: dw.ink }]}>{formatTime(member.totalTime)}</Text>
            <Text style={[styles.expandedStatLabel, { color: dw.ink2 }]}>Time</Text>
          </View>
          <View style={styles.expandedStatItem}>
            <View style={styles.expandedStatIconContainer}>
              <Ionicons name="speedometer-outline" size={14} color="#F9A825" />
            </View>
            <Text style={[styles.expandedStatValue, { color: dw.ink }]}>{convertSpeed(member.avgSpeed)}</Text>
            <Text style={[styles.expandedStatLabel, { color: dw.ink2 }]}>Avg Speed</Text>
          </View>
          <View style={styles.expandedStatItem}>
            <View style={styles.expandedStatIconContainer}>
              <Ionicons name="flash-outline" size={14} color="#F9A825" />
            </View>
            <Text style={[styles.expandedStatValue, { color: dw.ink }]}>{convertSpeed(member.topSpeed)}</Text>
            <Text style={[styles.expandedStatLabel, { color: dw.ink2 }]}>Top Speed</Text>
          </View>
          {member.photoCount != null && (
            <View style={styles.expandedStatItem}>
              <View style={styles.expandedStatIconContainer}>
                <Ionicons name="camera-outline" size={14} color="#F9A825" />
              </View>
              <Text style={[styles.expandedStatValue, { color: dw.ink }]}>{member.photoCount}</Text>
              <Text style={[styles.expandedStatLabel, { color: dw.ink2 }]}>Photos</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const GroupJourneyDetailScreen = (): React.JSX.Element => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dw = useDW();
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

  // Current selected photo for viewer
  const selectedPhoto = selectedPhotoIndex !== null ? photos[selectedPhotoIndex] : null;

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

  const initialsOf = (n?: string) =>
    (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('');
  const glass = {
    backgroundColor: 'rgba(255,253,248,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  } as const;
  const best = <K extends keyof MemberStat>(key: K) =>
    summary.memberStats.reduce<MemberStat | null>((b, m) => ((m[key] as number) > ((b?.[key] as number) ?? -1) ? m : b), null);
  const awards = [
    { award: 'Fastest', m: best('topSpeed'), value: (m: MemberStat) => convertSpeed(m.topSpeed) },
    { award: 'Furthest', m: best('totalDistance'), value: (m: MemberStat) => convertDistance(m.totalDistance) },
    { award: 'Shutterbug', m: best('photoCount'), value: (m: MemberStat) => `${m.photoCount ?? 0} photos` },
  ].filter((a) => a.m);
  const tiles = [
    { label: 'Riding time', value: formatTime(summary.groupStats.duration) },
    { label: 'Distance', value: convertDistance(summary.groupStats.totalDistance) },
  ];

  return (
    <View style={[styles.container, { backgroundColor: '#1A1814' }]}>
      <StatusBar barStyle="light-content" />

      {heroUri ? (
        <Image source={{ uri: heroUri }} style={dwStyles.hero} contentFit="cover" />
      ) : (
        <View style={[dwStyles.hero, { backgroundColor: '#2B2924' }]} />
      )}
      <LinearGradient colors={['rgba(17,16,14,0.45)', 'rgba(17,16,14,0)']} style={dwStyles.heroTop} />

      <View style={[dwStyles.top, { top: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[dwStyles.round, glass]}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFDF8" />
        </TouchableOpacity>
        <View style={[dwStyles.pill, glass]}>
          <View style={dwStyles.pillDot} />
          <Text style={dwStyles.pillText}>Group ride</Text>
        </View>
      </View>

      <View style={dwStyles.tiles}>
        {tiles.map((s) => (
          <View key={s.label} style={dwStyles.tile}>
            <Text style={dwStyles.tileLabel}>{s.label}</Text>
            <Text style={dwStyles.tileValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ paddingTop: 580 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[dwStyles.sheet, { backgroundColor: dw.surface }]}>
          <View style={dwStyles.titleRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[dwStyles.title, { color: dw.ink }]}>{summary.title}</Text>
              <Text style={[dwStyles.sub, { color: dw.ink2 }]}>
                {new Date(summary.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {summary.groupName}
              </Text>
            </View>
          </View>

          {awards.length > 0 && (
            <View style={dwStyles.awards}>
              {awards.map((a) => (
                <View key={a.award} style={[dwStyles.award, { backgroundColor: dw.surface2 }]}>
                  <View style={[dwStyles.awardAv, { backgroundColor: dw.dark ? '#F2EEE5' : INK }]}>
                    <Text style={{ fontFamily: F.black, fontSize: 11, color: dw.dark ? INK : AMBER }}>{initialsOf(a.m!.displayName)}</Text>
                  </View>
                  <Text style={[dwStyles.awardLabel, { color: dw.ink2 }]}>{a.award}</Text>
                  <Text style={[dwStyles.awardName, { color: dw.ink }]} numberOfLines={1}>{a.m!.displayName?.split(' ')[0]}</Text>
                  <Text style={[dwStyles.awardValue, { color: dw.ink2 }]} numberOfLines={1}>{a.value(a.m!)}</Text>
                </View>
              ))}
            </View>
          )}

          {summary.memberStats.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={[dwStyles.h2, { color: dw.ink }]}>Riders</Text>
              {summary.memberStats.map((member) => (
                <ExpandableMemberCard
                  key={member.userId}
                  member={member}
                  color={memberColors[member.userId] || AMBER}
                  convertDistance={convertDistance}
                  convertSpeed={convertSpeed}
                  formatTime={formatTime}
                />
              ))}
            </View>
          )}

          <View>
            <View style={dwStyles.rowBetween}>
              <Text style={[dwStyles.h2, { color: dw.ink }]}>Photo timeline</Text>
              <Text style={[dwStyles.count, { color: dw.ink2 }]}>
                {photos.length} {photos.length === 1 ? 'moment' : 'moments'}
              </Text>
            </View>
            <GroupPhotoTimeline
              photos={photos}
              onPhotoPress={(index) => setSelectedPhotoIndex(index)}
              memberColors={memberColors}
              convertSpeed={convertSpeed}
              convertDistance={convertDistance}
            />
          </View>
          <View style={{ height: 40 }} />
        </View>
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
            style={[styles.viewerClose, { top: insets.top + 10 }]}
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

              {/* Enhanced stats overlay */}
              <View style={[styles.viewerStatsOverlay, { paddingBottom: insets.bottom + 16 }]}>
                {/* Member info row */}
                <View style={styles.viewerMemberRow}>
                  {selectedPhoto?.userPhotoURL ? (
                    <Image
                      source={{ uri: selectedPhoto.userPhotoURL }}
                      style={styles.viewerMemberAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.viewerMemberAvatarPlaceholder, {
                      backgroundColor: memberColors[selectedPhoto?.userId || ''] || '#F9A825'
                    }]}>
                      <Text style={styles.viewerMemberInitial}>
                        {(selectedPhoto?.userName || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.viewerMemberInfo}>
                    <Text style={styles.viewerName}>
                      {selectedPhoto?.userName}
                    </Text>
                    {selectedPhoto?.takenAt && (
                      <Text style={styles.viewerTime}>
                        {new Date(selectedPhoto.takenAt).toLocaleTimeString(
                          'en-US',
                          { hour: '2-digit', minute: '2-digit' }
                        )}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Capture stats row */}
                {(selectedPhoto?.captureSpeed || selectedPhoto?.captureDistance || selectedPhoto?.latitude) && (
                  <View style={styles.viewerStatsRow}>
                    {selectedPhoto.captureSpeed != null && selectedPhoto.captureSpeed > 0 && (
                      <View style={styles.viewerStatItem}>
                        <Ionicons name="speedometer-outline" size={14} color="#F9A825" />
                        <Text style={styles.viewerStatText}>
                          {convertSpeed(selectedPhoto.captureSpeed)}
                        </Text>
                      </View>
                    )}
                    {selectedPhoto.captureDistance != null && selectedPhoto.captureDistance > 0 && (
                      <View style={styles.viewerStatItem}>
                        <Ionicons name="navigate-outline" size={14} color="#4CAF50" />
                        <Text style={styles.viewerStatText}>
                          {convertDistance(selectedPhoto.captureDistance)}
                        </Text>
                      </View>
                    )}
                    {selectedPhoto.latitude && selectedPhoto.longitude && (
                      <View style={styles.viewerStatItem}>
                        <Ionicons name="location-outline" size={14} color="#2196F3" />
                        <Text style={styles.viewerStatText}>
                          {selectedPhoto.latitude.toFixed(3)}, {selectedPhoto.longitude.toFixed(3)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Counter */}
                <Text style={styles.viewerCounter}>
                  {selectedPhotoIndex + 1} / {photos.length}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
};

const dwStyles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: 620 },
  heroTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER },
  pillText: { fontFamily: F.extra, fontSize: 13, color: '#FFFDF8' },
  tiles: { position: 'absolute', top: 470, left: 16, right: 16, flexDirection: 'row', gap: 10 },
  tile: { flex: 1, height: 86, borderRadius: 20, padding: 14, justifyContent: 'space-between', backgroundColor: 'rgba(26,24,20,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  tileLabel: { fontFamily: F.bold, fontSize: 12, color: 'rgba(255,253,248,0.82)' },
  tileValue: { fontFamily: F.monoBold, fontSize: 26, letterSpacing: -0.5, color: '#FFFDF8' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 16, minHeight: 600 },
  titleRow: { flexDirection: 'row' },
  title: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.4 },
  sub: { fontFamily: F.regular, fontSize: 13 },
  awards: { flexDirection: 'row', gap: 8 },
  award: { flex: 1, borderRadius: 16, padding: 12, paddingHorizontal: 10, gap: 6 },
  awardAv: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  awardLabel: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  awardName: { fontFamily: F.extra, fontSize: 14 },
  awardValue: { fontFamily: F.monoBold, fontSize: 12 },
  h2: { fontFamily: F.black, fontSize: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  count: { fontFamily: F.bold, fontSize: 13 },
});

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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  heroDate: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Space Grotesk',
    marginTop: 4,
    fontWeight: '500',
  },
  heroGroup: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F9A825',
    fontFamily: 'Space Grotesk',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
    marginBottom: 20,
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
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(249, 168, 37, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
    fontWeight: '500',
  },
  // Member Section - Expandable Cards
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
  expandableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16, // Smoother corners for premium feel
    padding: 16,      // Slightly more padding
    marginBottom: 12, // More space between cards
    // Remove borderLeftWidth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, // Very subtle shadow
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)', // Subtle border definition
  },
  expandableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandableAvatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandableAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  expandableAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandableInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  expandableNameSection: {
    flex: 1,
    marginLeft: 12,
  },
  expandableName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
  },
  expandableDistance: {
    fontSize: 13,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 1,
  },
  expandedStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  expandedStatItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  expandedStatIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(249, 168, 37, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  expandedStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
  },
  expandedStatLabel: {
    fontSize: 10,
    color: '#9E9E9E',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  // Timeline Section
  timelineSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  timelineSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  photoCount: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '500',
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
  // Enhanced viewer overlay
  viewerStatsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  viewerMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  viewerMemberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  viewerMemberAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerMemberInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  viewerMemberInfo: {
    marginLeft: 12,
    flex: 1,
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
    marginTop: 1,
  },
  viewerStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 10,
  },
  viewerStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  viewerStatText: {
    fontSize: 13,
    color: '#fff',
    fontFamily: 'Space Grotesk',
    fontWeight: '500',
  },
  viewerCounter: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default GroupJourneyDetailScreen;
