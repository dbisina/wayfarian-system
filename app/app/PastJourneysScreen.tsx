import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { userAPI, journeyAPI } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';
import { galleryAPI } from '../services/api';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

interface Journey {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  totalDistance: number;
  totalTime: number;
  vehicle?: string;
  customTitle?: string | null;
  isHidden?: boolean;
  hiddenAt?: string | null;
  coverPhotoUrl?: string;
  photos?: {
    id: string;
    firebasePath?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    takenAt: string;
  }[];
  group?: {
    id: string;
    name: string;
    coverPhotoUrl?: string;
  };
}

interface PastJourneysScreenProps {
  onBackPress?: () => void;
}

const PastJourneysScreen = ({ onBackPress }: PastJourneysScreenProps): React.JSX.Element => {
  const router = useRouter();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsJourney, setActionsJourney] = useState<Journey | null>(null);
  const [renameJourney, setRenameJourney] = useState<Journey | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { convertDistance } = useSettings();
  const { t } = useTranslation();

  const normalizeDistance = (value: number) => {
    if (!value) return 0;
    return value > 500 ? value / 1000 : value;
  };

  const formatDistance = (distance: number) => {
    return convertDistance(normalizeDistance(distance || 0));
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
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const fetchJourneys = async () => {
    try {
      setError(null);
      const response = await userAPI.getJourneyHistory({ 
        status: 'COMPLETED',
        sortBy: 'startTime',
        sortOrder: 'desc',
        limit: 50,
        includeHidden: true,
      });
      setJourneys(response.journeys || []);
    } catch (err: any) {
      console.error('Error fetching journeys:', err);
      setError(err.message || t('history.failedToLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchJourneys();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchJourneys();
  };

  const handleJourneyPress = (journey: Journey) => {
    // @ts-ignore - journey-detail is a valid route
    router.push({
      pathname: '/journey-detail',
      params: { journeyId: journey.id }
    });
  };

  const visibleJourneys = useMemo(() => {
    return journeys
      .filter((journey) => !journey.isHidden)
      .map((journey) => ({
        ...journey,
        title: journey.customTitle || journey.title,
      }));
  }, [journeys]);

  const updateJourneyState = (journeyId: string, updates: Partial<Journey>) => {
    setJourneys((prev) => prev.map((journey) => (journey.id === journeyId ? { ...journey, ...updates } : journey)));
  };

  const handleHideJourney = async (journeyId: string) => {
    try {
      await journeyAPI.updateJourneyPreferences(journeyId, { isHidden: true });
      updateJourneyState(journeyId, { isHidden: true, hiddenAt: new Date().toISOString() });
      Alert.alert(t('history.hidden'), t('history.hiddenMsg'));
    } catch (hideError: any) {
      console.error('Hide journey error:', hideError);
      Alert.alert(t('alerts.error'), hideError?.message || t('history.failedToHide'));
    }
  };

  const confirmHideJourney = (journey: Journey) => {
    Alert.alert(
      t('history.hideConfirm'),
      t('history.hideConfirmSub'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('history.hide'),
          style: 'destructive',
          onPress: () => handleHideJourney(journey.id),
        },
      ]
    );
    setActionsJourney(null);
  };

  const confirmDeleteJourney = (journey: Journey) => {
    Alert.alert(
      t('history.deleteConfirm'),
      t('history.deleteConfirmSub'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
             setActionsJourney(null);
             try {
               await journeyAPI.deleteJourney(journey.id);
               setJourneys(prev => prev.filter(j => j.id !== journey.id));
               Alert.alert(t('history.deleted'), t('history.deletedMsg'));
             } catch (err: any) {
               console.error('Delete error:', err);
               Alert.alert(t('alerts.error'), err.message || t('alerts.error'));
             }
          },
        },
      ]
    );
  };

  const handleAddPhotos = async (journey: Journey) => {
    setActionsJourney(null);
    if (!journey) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('journeyDetail.alerts.photoPermission'), t('journeyDetail.alerts.galleryNeeded'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Show loading indicator or toast? For now just silent or alert on completion to keep it simple in list view
        // Ideally we'd show a global loader or toast
        
        let successCount = 0;
        for (const asset of result.assets) {
          try {
            await galleryAPI.uploadPhotoWithProgress(
              asset.uri,
              journey.id,
              () => {} 
            );
            successCount++;
          } catch (err) {
            console.error('Failed to upload photo:', err);
          }
        }

        if (successCount > 0) {
          Alert.alert(t('alerts.success'), `${successCount} ${t('history.photoSuccess')}`);
          fetchJourneys(); // Refresh to show new photo count/cover
        } else {
          Alert.alert(t('alerts.error'), t('journeyDetail.alerts.uploadFailed'));
        }
      }
    } catch (err: any) {
      Alert.alert(t('alerts.error'), err.message || t('journeyDetail.alerts.uploadFailed'));
    }
  };

  const openJourneyActions = (journey: Journey) => {
    setActionsJourney(journey);
  };

  const beginRenameJourney = (journey: Journey) => {
    setActionsJourney(null);
    setRenameJourney(journey);
    setRenameValue(journey.customTitle || journey.title || '');
  };

  const cancelRename = () => {
    setRenameJourney(null);
    setRenameValue('');
  };

  const saveRenamedJourney = async () => {
    if (!renameJourney) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      Alert.alert(t('history.nameRequired'), t('history.shortTitle'));
      return;
    }
    try {
      // Optimistic update
      const journeyId = renameJourney.id;
      
      // Call API
      await journeyAPI.updateJourneyPreferences(journeyId, { customTitle: trimmed });
      
      // Update local state
      updateJourneyState(journeyId, { customTitle: trimmed });
      
      // Close modal
      cancelRename();
      
      // Optional: Show success toast/alert if needed, but UI update should be enough
    } catch (renameError: any) {
      console.error('Rename journey error:', renameError);
      Alert.alert(t('history.renameFailed'), renameError?.message || t('history.renameFailed'));
      // Revert optimistic update if we did it before API (here we do it after, so no revert needed)
    }
  };

  const restoreHiddenJourneys = async () => {
    try {
      const result = await journeyAPI.restoreHiddenJourneys();
      if (result?.restored) {
        setJourneys((prev) => prev.map((journey) => ({ ...journey, isHidden: false, hiddenAt: null })));
      }
      Alert.alert(t('history.done'), result?.message || t('history.restoredMsg'));
    } catch (restoreError: any) {
      console.error('Restore hidden journeys error:', restoreError);
      Alert.alert(t('alerts.error'), restoreError?.message || 'Could not restore hidden journeys.');
    }
  };

  const clearCustomTitles = async () => {
    try {
      const result = await journeyAPI.clearCustomJourneyTitles();
      if (result?.cleared) {
        setJourneys((prev) => prev.map((journey) => ({ ...journey, customTitle: null })));
      }
      Alert.alert(t('history.done'), result?.message || t('history.clearedMsg'));
    } catch (clearError: any) {
      console.error('Clear custom titles error:', clearError);
      Alert.alert(t('alerts.error'), clearError?.message || 'Could not clear custom names.');
    }
  };

  const hasHiddenJourneys = useMemo(() => journeys.some((journey) => journey.isHidden), [journeys]);
  const hasCustomTitles = useMemo(() => journeys.some((journey) => journey.customTitle), [journeys]);

  const handleHeaderOptions = () => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }[] = [];
    if (hasHiddenJourneys) {
      options.push({ text: t('history.restoreHidden'), onPress: restoreHiddenJourneys });
    }
    if (hasCustomTitles) {
      options.push({ text: t('history.clearCustomNames'), onPress: clearCustomTitles });
    }
    options.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(t('history.options'), t('history.optionsSub'), options);
  };

  const BackIcon = () => (
    <Text style={styles.backIconText}>←</Text>
  );

  const MoreIcon = () => (
    <Text style={styles.moreIconText}>⋮</Text>
  );

  const ChevronIcon = () => (
    <Text style={styles.chevronIconText}>›</Text>
  );

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#3E4751" />
        <Text style={styles.loadingText}>{t('history.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchJourneys}>
          <Text style={styles.retryButtonText}>{t('history.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.7}
        >
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('history.title')}</Text>
        <TouchableOpacity style={styles.moreButton} activeOpacity={0.7} onPress={handleHeaderOptions}>
          <MoreIcon />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {visibleJourneys.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>🚗</Text>
            <Text style={styles.emptyStateTitle}>{t('history.noJourneys')}</Text>
            <Text style={styles.emptyStateText}>
              {t('history.startFirstJourney')}
            </Text>
          </View>
        ) : (
          visibleJourneys.map((journey, index) => {
            const photoCount = journey.photos?.length || 0;
            const coverUri =
              journey.coverPhotoUrl ||
              journey.group?.coverPhotoUrl ||
              journey.photos?.[0]?.thumbnailUrl ||
              journey.photos?.[0]?.imageUrl ||
              journey.photos?.[0]?.firebasePath;
            
            return (
              <TouchableOpacity
                key={journey.id}
                style={styles.journeyItem}
                activeOpacity={0.7}
                onPress={() => handleJourneyPress(journey)}
              >
                <View style={styles.journeyContent}>
                  {coverUri ? (
                    <Image 
                      source={coverUri ? { uri: coverUri } : undefined} 
                      style={styles.journeyImage} 
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <LinearGradient
                      colors={['#F9A825', '#FF6F00']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.journeyImage, styles.gradientPlaceholder]}
                    >
                      <Text style={styles.gradientTitle} numberOfLines={2}>
                        {journey.title || t('history.defaultTitle')}
                      </Text>
                    </LinearGradient>
                  )}
                  {photoCount > 0 && (
                    <View style={styles.photoBadge}>
                      <Text style={styles.photoBadgeText}>📷 {photoCount}</Text>
                    </View>
                  )}
                  <View style={styles.journeyInfo}>
                    <Text style={styles.journeyTitle} numberOfLines={1}>
                      {journey.title || t('history.defaultTitle')}
                    </Text>
                    <Text style={styles.journeyDate}>
                      {formatDate(journey.startTime)}
                    </Text>
                    <Text style={styles.journeyStats}>
                      {formatDistance(journey.totalDistance)} • {formatTime(journey.totalTime)}
                    </Text>
                  </View>
                </View>
                <View style={styles.trailingActions}>
                  <TouchableOpacity
                    style={styles.itemMenuButton}
                    onPress={() => openJourneyActions(journey)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="more-vert" size={20} color="#9E9E9E" />
                  </TouchableOpacity>
                  <ChevronIcon />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!actionsJourney} transparent animationType="fade" onRequestClose={() => setActionsJourney(null)}>
        <TouchableWithoutFeedback onPress={() => setActionsJourney(null)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.actionSheet}>
          <Text style={styles.actionSheetTitle}>{actionsJourney?.title || 'Journey options'}</Text>
          <TouchableOpacity
            style={styles.actionSheetButton}
            onPress={() => actionsJourney && beginRenameJourney(actionsJourney)}
          >
            <MaterialIcons name="edit" size={18} color="#111827" />
            <Text style={styles.actionSheetButtonText}>{t('history.rename')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionSheetButton}
            onPress={() => actionsJourney && confirmHideJourney(actionsJourney)}
          >
            <MaterialIcons name="archive" size={18} color="#DC2626" />
            <Text style={[styles.actionSheetButtonText, { color: '#DC2626' }]}>{t('history.hide')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionSheetButton}
            onPress={() => actionsJourney && handleAddPhotos(actionsJourney)}
          >
             <Ionicons name="images" size={18} color="#111827" />
             <Text style={styles.actionSheetButtonText}>{t('history.addPhotos')}</Text>
          </TouchableOpacity>
           <TouchableOpacity
            style={styles.actionSheetButton}
            onPress={() => actionsJourney && confirmDeleteJourney(actionsJourney)}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <Text style={[styles.actionSheetButtonText, { color: '#DC2626' }]}>{t('history.delete')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionSheetButton, styles.actionSheetCancel]}
            onPress={() => setActionsJourney(null)}
          >
            <Text style={styles.actionSheetCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={!!renameJourney} transparent animationType="fade" onRequestClose={cancelRename}>
        <View style={styles.renameModalBackdrop}>
          <View style={styles.renameModalCard}>
            <Text style={styles.renameModalTitle}>{t('history.rename')}</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={t('history.defaultTitle')}
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity style={styles.renameCancelButton} onPress={cancelRename}>
                <Text style={styles.renameCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSaveButton} onPress={saveRenamedJourney}>
                <Text style={styles.renameSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 48,
    height: 48,
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
    lineHeight: 23,
    textAlign: 'center',
    flex: 1,
  },
  moreButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreIconText: {
    fontSize: 24,
    color: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  journeyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  journeyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  journeyImage: {
    width: 100,
    height: 56,
    borderRadius: 8,
    marginRight: 16,
    backgroundColor: '#F5F5F5',
  },
  journeyImagePlaceholder: {
    width: 100,
    height: 56,
    borderRadius: 8,
    marginRight: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  journeyImageEmoji: {
    fontSize: 32,
  },
  photoBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Space Grotesk',
  },
  journeyInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  journeyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginBottom: 2,
  },
  journeyDate: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
  journeyStats: {
    fontSize: 13,
    fontWeight: '400',
    color: '#9E9E9E',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  chevronIconText: {
    fontSize: 24,
    color: '#BDBDBD',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  actionSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'Space Grotesk',
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  actionSheetButtonText: {
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Space Grotesk',
  },
  actionSheetCancel: {
    justifyContent: 'center',
  },
  actionSheetCancelText: {
    fontSize: 15,
    color: '#6B7280',
    fontFamily: 'Space Grotesk',
  },
  renameModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  renameModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  renameModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Space Grotesk',
    marginBottom: 12,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Space Grotesk',
    marginBottom: 16,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  renameCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  renameCancelText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Space Grotesk',
    fontWeight: '600',
  },
  renameSaveButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  renameSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Space Grotesk',
  },
  gradientPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  gradientTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
});

export default PastJourneysScreen;
