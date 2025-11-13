import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { userAPI } from '../services/api';

interface Journey {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  totalDistance: number;
  totalTime: number;
  vehicle?: string;
  photos?: {
    id: string;
    firebasePath: string;
    takenAt: string;
  }[];
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

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
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
        limit: 50 
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
        <TouchableOpacity style={styles.moreButton} activeOpacity={0.7}>
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
        {journeys.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>🚗</Text>
            <Text style={styles.emptyStateTitle}>No Journeys Yet</Text>
            <Text style={styles.emptyStateText}>
              Start your first journey to see it here
            </Text>
          </View>
        ) : (
          journeys.map((journey, index) => {
            const photoCount = journey.photos?.length || 0;
            const thumbnail = journey.photos?.[0];
            
            return (
              <TouchableOpacity
                key={journey.id}
                style={styles.journeyItem}
                activeOpacity={0.7}
                onPress={() => handleJourneyPress(journey)}
              >
                <View style={styles.journeyContent}>
                  {thumbnail ? (
                    <Image 
                      source={{ uri: thumbnail.firebasePath }} 
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
                <View style={styles.chevronContainer}>
                  <ChevronIcon />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
  chevronContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronIconText: {
    fontSize: 24,
    color: '#BDBDBD',
  },
});

export default PastJourneysScreen;
