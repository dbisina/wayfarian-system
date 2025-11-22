import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { userAPI, journeyAPI } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';

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
  const { convertDistance } = useSettings();

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
      setError(err.message || 'Failed to load journeys');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJourneys();
  }, []);

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
      Alert.alert('Removed', 'This journey was hidden from your list.');
    } catch (hideError: any) {
      console.error('Hide journey error:', hideError);
      Alert.alert('Failed to hide', hideError?.message || 'Could not update this journey.');
    }
  };

  const confirmHideJourney = (journey: Journey) => {
    Alert.alert(
      'Hide this journey?',
      'It will disappear from this list but remain safely stored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: () => handleHideJourney(journey.id),
        },
      ]
    );
    setActionsJourney(null);
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
      Alert.alert('Name required', 'Give this journey a short title.');
      return;
    }
    try {
      await journeyAPI.updateJourneyPreferences(renameJourney.id, { customTitle: trimmed });
      updateJourneyState(renameJourney.id, { customTitle: trimmed });
      cancelRename();
    } catch (renameError: any) {
      console.error('Rename journey error:', renameError);
      Alert.alert('Rename failed', renameError?.message || 'Could not rename this journey.');
    }
  };

  const restoreHiddenJourneys = async () => {
    try {
      const result = await journeyAPI.restoreHiddenJourneys();
      if (result?.restored) {
        setJourneys((prev) => prev.map((journey) => ({ ...journey, isHidden: false, hiddenAt: null })));
      }
      Alert.alert('Done', result?.message || 'Hidden journeys are visible again.');
    } catch (restoreError: any) {
      console.error('Restore hidden journeys error:', restoreError);
      Alert.alert('Restore failed', restoreError?.message || 'Could not restore hidden journeys.');
    }
  };

  const clearCustomTitles = async () => {
    try {
      const result = await journeyAPI.clearCustomJourneyTitles();
      if (result?.cleared) {
        setJourneys((prev) => prev.map((journey) => ({ ...journey, customTitle: null })));
      }
      Alert.alert('Done', result?.message || 'Custom names removed.');
    } catch (clearError: any) {
      console.error('Clear custom titles error:', clearError);
      Alert.alert('Clear failed', clearError?.message || 'Could not clear custom names.');
    }
  };

  const hasHiddenJourneys = useMemo(() => journeys.some((journey) => journey.isHidden), [journeys]);
  const hasCustomTitles = useMemo(() => journeys.some((journey) => journey.customTitle), [journeys]);

  const handleHeaderOptions = () => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }[] = [];
    if (hasHiddenJourneys) {
      options.push({ text: 'Restore hidden journeys', onPress: restoreHiddenJourneys });
    }
    if (hasCustomTitles) {
      options.push({ text: 'Clear custom names', onPress: clearCustomTitles });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('History options', 'Manage how your rides appear.', options);
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
        <Text style={styles.loadingText}>Loading journeys...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchJourneys}>
          <Text style={styles.retryButtonText}>Try Again</Text>
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
        <Text style={styles.headerTitle}>Your Journeys</Text>
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
            <Text style={styles.emptyStateTitle}>No Journeys Yet</Text>
            <Text style={styles.emptyStateText}>
              Start your first journey to see it here
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
                      source={{ uri: coverUri }} 
                      style={styles.journeyImage} 
                    />
                  ) : (
                    <View style={styles.journeyImagePlaceholder}>
                      <Text style={styles.journeyImageEmoji}>
                        {journey.vehicle === 'bike' ? '🚴' : journey.vehicle === 'car' ? '🚗' : '🏃'}
                      </Text>
                    </View>
                  )}
                  {photoCount > 0 && (
                    <View style={styles.photoBadge}>
                      <Text style={styles.photoBadgeText}>📷 {photoCount}</Text>
                    </View>
                  )}
                  <View style={styles.journeyInfo}>
                    <Text style={styles.journeyTitle} numberOfLines={1}>
                      {journey.title || `Journey ${index + 1}`}
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
            <Text style={styles.actionSheetButtonText}>Rename journey</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionSheetButton}
            onPress={() => actionsJourney && confirmHideJourney(actionsJourney)}
          >
            <MaterialIcons name="archive" size={18} color="#DC2626" />
            <Text style={[styles.actionSheetButtonText, { color: '#DC2626' }]}>Remove from list</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionSheetButton, styles.actionSheetCancel]}
            onPress={() => setActionsJourney(null)}
          >
            <Text style={styles.actionSheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={!!renameJourney} transparent animationType="fade" onRequestClose={cancelRename}>
        <View style={styles.renameModalBackdrop}>
          <View style={styles.renameModalCard}>
            <Text style={styles.renameModalTitle}>Rename journey</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Morning ride"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity style={styles.renameCancelButton} onPress={cancelRename}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSaveButton} onPress={saveRenamedJourney}>
                <Text style={styles.renameSaveText}>Save</Text>
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
});

export default PastJourneysScreen;
