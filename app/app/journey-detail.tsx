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
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, G, Circle } from 'react-native-svg';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  vehicleName?: string;
  vehicleType?: string;
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
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const d = useDW();
  
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
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language, { 
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
      Alert.alert(t('alerts.success'), t('alerts.journeyComplete')); 
      Alert.alert(t('alerts.success'), t('journeyDetail.alerts.titleUpdated'));
    } catch (err: any) {
      Alert.alert(t('alerts.error'), err.message || t('alerts.error'));
    } finally {
      setSaving(false);
    }
  };

  // Delete journey
  const handleDeleteJourney = () => {
    if (!journey) return;

    if (journey.status === 'ACTIVE') {
      Alert.alert(t('journeyDetail.alerts.cantDelete'), t('journeyDetail.alerts.endFirst'));
      return;
    }

    Alert.alert(
      t('journeyDetail.deleteJourney'),
      t('journeyDetail.alerts.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await journeyAPI.deleteJourney(journey.id);
              Alert.alert(t('journeyDetail.alerts.deleted'), t('journeyDetail.alerts.deleted'));
              router.back();
            } catch (err: any) {
              Alert.alert(t('alerts.error'), err.message || t('journeyDetail.alerts.cantDelete'));
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
          Alert.alert(t('alerts.success'), t('journeyDetail.alerts.photoAdded'));
          // Refresh journey to show new photos
          await fetchJourneyDetail();
        } else {
          Alert.alert(t('alerts.error'), t('journeyDetail.alerts.uploadFailed'));
        }
      }
    } catch (err: any) {
      Alert.alert(t('alerts.error'), err.message || t('journeyDetail.alerts.uploadFailed'));
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
        Alert.alert(t('journeyDetail.alerts.photoPermission'), t('journeyDetail.alerts.cameraNeeded'));
        return;
      }

      setShowOptionsMenu(false);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
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
          Alert.alert(t('alerts.success'), t('journeyDetail.alerts.photoAdded'));
          await fetchJourneyDetail();
        } catch (err) {
          Alert.alert(t('alerts.error'), t('journeyDetail.alerts.uploadFailed'));
        }
      }
    } catch (err: any) {
      Alert.alert(t('alerts.error'), err.message || t('journeyDetail.alerts.uploadFailed'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#3E4751" />
        <Text style={styles.loadingText}>{t('journeyDetail.loading')}</Text>
      </View>
    );
  }

  if (error || !journey) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error || t('journeyDetail.notFound')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>{t('journeyDetail.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const journeyPhotos = journey.photos ?? [];
  const displayTitle = journey.customTitle || journey.title || t('journeyDetail.untitled');
  const isCompletedOrCancelled = journey.status === 'COMPLETED' || journey.status === 'CANCELLED' || !journey.status;

  const mapC = d.dark
    ? { bg: '#161513', block: '#1E1C19', road: '#2A2723' }
    : { bg: '#ECE6D9', block: '#E2DBCB', road: '#FFFDF8' };
  const hm = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const dayLine = `${new Date(journey.startTime)
    .toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase()} · ${hm(journey.startTime)}${journey.endTime ? ` to ${hm(journey.endTime)}` : ''}`;
  const dur = liveTime !== null ? liveTime : journey.totalTime;
  const durText = `${Math.floor(dur / 3600)}h ${String(Math.floor((dur % 3600) / 60)).padStart(2, '0')}m`;
  const statCells = [
    { label: t('journeyDetail.distance'), value: formatDistance(journey.totalDistance) },
    { label: t('journeyDetail.duration'), value: durText },
    { label: t('journeyDetail.avgSpeed'), value: journey.avgSpeed > 0 ? String(convertSpeed(journey.avgSpeed)) : '–' },
    { label: t('journeyDetail.topSpeed'), value: String(convertSpeed(journey.topSpeed)) },
  ];

  return (
    <View style={[styles.container, { backgroundColor: d.surface }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />

      <Svg width="100%" height={290} viewBox="0 0 390 290" preserveAspectRatio="xMidYMin slice" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Rect width={390} height={290} fill={mapC.bg} />
        {[[20, 120, 90, 60], [150, 100, 70, 90], [260, 130, 100, 70], [40, 200, 120, 50]].map(([x, y, w, h], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} rx={10} fill={mapC.block} />
        ))}
        <G fill="none" stroke={mapC.road} strokeWidth={8} strokeLinecap="round">
          <Path d="M0 190 L390 200" />
          <Path d="M130 0 L136 290" />
          <Path d="M240 0 L246 290" />
        </G>
        <Path d="M40 262 C90 230 110 170 170 160 S260 130 290 90 S340 60 356 110" fill="none" stroke={AMBER} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={40} cy={262} r={8} fill={d.ink} stroke="#FFFDF8" strokeWidth={3} />
        <Rect x={348} y={102} width={16} height={16} rx={4} transform="rotate(45 356 110)" fill={AMBER} stroke={INK} strokeWidth={2.5} />
      </Svg>

      <View style={[styles.dwTop, { top: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.dwRound, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowOptionsMenu(true)}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={[styles.dwRound, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={d.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 246, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.dwSheet, { backgroundColor: d.surface }]}>
          <Text style={[styles.dwMono, { color: d.ink2 }]}>{dayLine}</Text>
          <Text style={[styles.dwTitle, { color: d.ink }]}>{displayTitle}</Text>

          <View style={[styles.dwStats, { borderTopColor: d.line }]}>
            {statCells.map((s, i) => (
              <View
                key={s.label}
                style={[
                  styles.dwStat,
                  { borderBottomColor: d.line },
                  i % 2 === 1 && { borderLeftWidth: 1, borderLeftColor: d.line, paddingLeft: 16 },
                ]}
              >
                <Text style={[styles.dwStatLabel, { color: d.ink2 }]}>{s.label}</Text>
                <Text style={[styles.dwStatValue, { color: d.ink }]}>{s.value}</Text>
              </View>
            ))}
          </View>

          {(journey.vehicleName || journey.vehicle) && (
            <View style={[styles.dwBike, { backgroundColor: d.panel }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dwBikeEyebrow, { color: d.panelMuted }]}>Ridden on</Text>
                <Text style={[styles.dwBikeName, { color: d.panelText }]} numberOfLines={1}>
                  {journey.vehicleName ?? journey.vehicle}
                </Text>
              </View>
              <Icon name="route" size={26} color={AMBER} stroke={2} />
            </View>
          )}

          <View style={styles.dwMomentsHead}>
            <Text style={[styles.dwH2, { color: d.ink }]}>Moments</Text>
            <Text style={[styles.dwCount, { color: d.ink2 }]}>
              {journeyPhotos.length} {journeyPhotos.length === 1 ? 'photo' : 'photos'}
            </Text>
          </View>
          {journeyPhotos.length > 0 ? (
            <View style={styles.dwMoments}>
              {journeyPhotos.slice(0, 6).map((photo, index) => {
                const uri =
                  getFirebaseDownloadUrl(photo.imageUrl || photo.firebasePath) || photo.imageUrl || photo.firebasePath;
                return (
                  <TouchableOpacity
                    key={photo.id}
                    onPress={() => openPhotoViewer(index)}
                    activeOpacity={0.85}
                    style={[styles.dwMoment, { width: index === 0 ? '100%' : '48.5%', height: index === 0 ? 150 : 96, backgroundColor: d.surface2 }]}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Photo at ${hm(photo.takenAt)}`}
                  >
                    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
                    <View style={styles.dwMomentTime}>
                      <Text style={styles.dwMomentTimeText}>{hm(photo.takenAt)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.dwCount, { color: d.ink2 }]}>{t('journeyDetail.noPhotos')}</Text>
          )}

          {isCompletedOrCancelled && (
            <View style={styles.dwPhotoActions}>
              <TouchableOpacity
                style={[styles.dwBtn, { backgroundColor: AMBER }]}
                onPress={handleAddPhotos}
                disabled={uploadingPhoto}
                accessibilityRole="button"
              >
                {uploadingPhoto ? <ActivityIndicator color={INK} /> : <Text style={[styles.dwBtnText, { color: INK }]}>{t('journeyDetail.addPhotos')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dwBtn, { borderWidth: 1.5, borderColor: d.line2 }]}
                onPress={handleTakePhoto}
                disabled={uploadingPhoto}
                accessibilityRole="button"
              >
                <Text style={[styles.dwBtnText, { color: d.ink }]}>{t('journeyDetail.takePhoto')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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
              <Text style={styles.optionText}>{t('journeyDetail.editTitle')}</Text>
            </TouchableOpacity>
            
            {isCompletedOrCancelled && (
              <>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={handleAddPhotos}
                >
                  <Ionicons name="images" size={20} color="#000" />
                  <Text style={styles.optionText}>{t('journeyDetail.addPhotos')}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={handleTakePhoto}
                >
                  <Ionicons name="camera" size={20} color="#000" />
                  <Text style={styles.optionText}>{t('journeyDetail.takePhoto')}</Text>
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
              <Text style={[styles.optionText, styles.deleteText]}>{t('journeyDetail.deleteJourney')}</Text>
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
            <Text style={styles.editModalTitle}>{t('journeyDetail.editModal.title')}</Text>
            <TextInput
              style={styles.editInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t('journeyDetail.editModal.enterTitle')}
              placeholderTextColor="#999"
              maxLength={60}
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveTitle}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('common.save')}</Text>
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
          statusBarTranslucent
        >
          <View style={styles.photoViewerContainer}>
            <StatusBar barStyle="light-content" />
            {/* Tap-anywhere fallback: a transparent overlay above the FlatList
                that closes the viewer on a single tap. Pinned to the top safe-area
                only so horizontal swipes between photos still work below.
                Fixes the "image won't close" report — the close button was sometimes
                hidden behind the status bar / dynamic island on tall devices. */}
            <TouchableOpacity
              style={[styles.photoViewerTopTapZone, { height: Math.max(insets.top, 24) + 56 }]}
              activeOpacity={1}
              onPress={closePhotoViewer}
              accessibilityRole="button"
              accessibilityLabel={t('common.close') || 'Close'}
            />

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
                  {sourceUri && (
                    <Image 
                      source={{ uri: sourceUri }} 
                      style={styles.photoViewerImage}
                      contentFit="contain"
                      transition={200}
                      onError={() => console.warn('Failed to load photo in viewer')}
                    />
                  )}
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

            {/* Photo counter and close button rendered AFTER the FlatList so they paint
                on top on Android (where z-index alone isn't reliable without elevation). */}
            <View style={styles.photoCounter} pointerEvents="none">
              <Text style={styles.photoCounterText}>
                {selectedPhotoIndex + 1} / {journeyPhotos.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeButton, { top: Math.max(insets.top, 24) + 4 }]}
              onPress={closePhotoViewer}
              activeOpacity={0.7}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close') || 'Close'}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dwTop: { position: 'absolute', left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between' },
  dwRound: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dwSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, gap: 12, minHeight: 600 },
  dwMono: { fontFamily: F.monoSemi, fontSize: 12 },
  dwTitle: { fontFamily: F.black, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  dwStats: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1 },
  dwStat: { width: '50%', paddingVertical: 12, borderBottomWidth: 1, gap: 2 },
  dwStatLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  dwStatValue: { fontFamily: F.monoBold, fontSize: 22 },
  dwBike: { height: 72, borderRadius: 20, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dwBikeEyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  dwBikeName: { fontFamily: F.black, fontSize: 16 },
  dwMomentsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 },
  dwH2: { fontFamily: F.black, fontSize: 18 },
  dwCount: { fontFamily: F.bold, fontSize: 13 },
  dwMoments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dwMoment: { borderRadius: 16, overflow: 'hidden' },
  dwMomentTime: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(26,24,20,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dwMomentTimeText: { fontFamily: F.monoBold, fontSize: 11, color: '#FFFDF8' },
  dwPhotoActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  dwBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dwBtnText: { fontFamily: F.extra, fontSize: 14 },
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
    marginTop: 16,
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
  statCell: {
    width: '50%',
    padding: 8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  vehicleName: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '500',
    color: '#AAAAAA',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
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
    backgroundColor: '#F9A825',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#F9A825',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addPhotosButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Space Grotesk',
  },
  takePhotoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F9A825',
    gap: 8,
  },
  takePhotoButtonText: {
    color: '#F9A825',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Space Grotesk',
  },
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
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
    width: 20,
    alignItems: 'center',
    marginRight: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#F9A825',
    zIndex: 2,
  },
  firstDot: {
    borderColor: '#F9A825',
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    backgroundColor: '#F0F0F0',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTime: {
    fontSize: 13,
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
    marginBottom: 12,
    fontWeight: '700',
  },
  timelinePhoto: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
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
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    paddingVertical: 60,
    paddingHorizontal: 40,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyPhotosEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyPhotosText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  emptyPhotosSubtext: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
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
    backgroundColor: '#F9A825',
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
    right: 16,
    zIndex: 100,
    elevation: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerTopTapZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 6,
    backgroundColor: 'transparent',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  photoCounter: {
    position: 'absolute',
    top: 56,
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
