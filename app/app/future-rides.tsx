import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../services/api';

interface FutureRide {
  id: string;
  title: string;
  groupName: string;
  groupId: string;
  date: string;
  location: string;
  creatorName?: string;
  status: 'PLANNED' | 'READY_TO_START';
}

export default function FutureRidesScreen() {
  const [rides, setRides] = useState<FutureRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingJourneyId, setStartingJourneyId] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const fetchRides = async () => {
    try {
      // Fetch both PLANNED and READY_TO_START journeys
      const [plannedResponse, readyResponse] = await Promise.all([
        apiRequest('/journey/history?status=PLANNED', { method: 'GET' }),
        apiRequest('/journey/history?status=READY_TO_START', { method: 'GET' }),
      ]);

      const allJourneys = [
        ...(readyResponse.success && Array.isArray(readyResponse.journeys) ? readyResponse.journeys : []),
        ...(plannedResponse.success && Array.isArray(plannedResponse.journeys) ? plannedResponse.journeys : []),
      ];

      // Map journey history format to FutureRide format
      const mappedRides = allJourneys.map((j: any) => ({
        id: j.id,
        title: j.title || 'Planned Ride',
        groupName: j.group?.name || 'Solo Ride',
        groupId: j.groupId,
        date: j.startTime,
        location: (j.startLatitude && j.startLongitude)
          ? `${j.startLatitude.toFixed(3)}, ${j.startLongitude.toFixed(3)}`
          : 'Location TBD',
        creatorName: 'You',
        status: j.status,
      }));
      
      // Sort by date, with READY_TO_START first
      mappedRides.sort((a, b) => {
        if (a.status === 'READY_TO_START' && b.status !== 'READY_TO_START') return -1;
        if (a.status !== 'READY_TO_START' && b.status === 'READY_TO_START') return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      
      setRides(mappedRides);
    } catch (error: any) {
      console.warn('Failed to fetch future rides', error);
      Alert.alert('Error', 'Failed to load upcoming rides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRides();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRides();
  };

  const handleStartJourney = async (journeyId: string, isPlanned: boolean = false) => {
    // If it's a PLANNED journey (not yet READY_TO_START), show confirmation
    if (isPlanned) {
      Alert.alert(
        'Start Journey Early?',
        'This journey is scheduled for later. Are you sure you want to start it now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Start Now', 
            style: 'default',
            onPress: () => startJourneyNow(journeyId)
          },
        ]
      );
      return;
    }
    
    await startJourneyNow(journeyId);
  };

  const startJourneyNow = async (journeyId: string) => {
    try {
      setStartingJourneyId(journeyId);
      
      // Update journey status to ACTIVE
      const response = await apiRequest(`/journey/${journeyId}/start`, {
        method: 'POST',
        body: {}, // Send empty object to prevent "invalid JSON" parse error
      });

      if (response.success) {
        // Navigate to active journey screen
        router.push('/journey');
      } else {
        Alert.alert('Error', response.message || 'Failed to start journey');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start journey');
    } finally {
      setStartingJourneyId(null);
    }
  };

  const getTimeUntil = (date: string): string => {
    const now = new Date();
    const target = new Date(date);
    const diffMs = target.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Now';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
    
    const minutes = Math.floor(diffMs / (1000 * 60));
    return `${minutes} min${minutes > 1 ? 's' : ''} left`;
  };

  const renderItem = ({ item }: { item: FutureRide }) => {
    const isReady = item.status === 'READY_TO_START';
    const isPlanned = item.status === 'PLANNED';
    const isStarting = startingJourneyId === item.id;
    
    return (
      <TouchableOpacity 
        style={[styles.card, isReady && styles.readyCard]}
        onPress={() => handleStartJourney(item.id, isPlanned)}
        disabled={isStarting}
      >
        {isReady && (
          <View style={styles.readyBadge}>
            <Ionicons name="flag" size={12} color="#fff" />
            <Text style={styles.readyBadgeText}>Ready to Start!</Text>
          </View>
        )}
        {isPlanned && (
          <View style={styles.plannedBadge}>
            <Ionicons name="calendar-outline" size={12} color="#fff" />
            <Text style={styles.plannedBadgeText}>Scheduled</Text>
          </View>
        )}
        
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.groupName}>{item.groupName}</Text>
        </View>
        
        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={16} color={isReady ? "#059669" : "#666"} />
            <Text style={[styles.detailText, isReady && styles.readyText]}>
              {new Date(item.date).toLocaleDateString()} at {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color="#666" />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
          {isPlanned && (
            <View style={styles.detailRow}>
              <Ionicons name="time" size={16} color="#F9A825" />
              <Text style={styles.countdownText}>{getTimeUntil(item.date)}</Text>
            </View>
          )}
        </View>
        
        {/* Start button for READY_TO_START journeys */}
        {isReady && (
          <TouchableOpacity 
            style={styles.startButton}
            onPress={() => handleStartJourney(item.id, false)}
            disabled={isStarting}
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.startButtonText}>Start Journey</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        
        {/* Start Early button for PLANNED journeys */}
        {isPlanned && (
          <TouchableOpacity 
            style={styles.startEarlyButton}
            onPress={() => handleStartJourney(item.id, true)}
            disabled={isStarting}
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#F9A825" />
            ) : (
              <>
                <Ionicons name="play-circle-outline" size={18} color="#F9A825" />
                <Text style={styles.startEarlyButtonText}>Start Now</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Custom Header with Back Button */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1D1B20" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Future Rides</Text>
        <View style={styles.headerPlaceholder} />
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F9A825" />
        </View>
      ) : (
        <FlatList
          data={rides}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No upcoming rides scheduled.</Text>
              <Text style={styles.emptySubtext}>Plan a journey to see it here!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  readyCard: {
    borderColor: '#059669',
    borderWidth: 2,
    backgroundColor: '#ecfdf5',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 4,
  },
  readyBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  groupName: {
    fontSize: 14,
    color: '#F9A825',
    fontWeight: '600',
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#4b5563',
  },
  readyText: {
    color: '#059669',
    fontWeight: '600',
  },
  countdownText: {
    fontSize: 14,
    color: '#F9A825',
    fontWeight: '600',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  startEarlyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#F9A825',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  startEarlyButtonText: {
    color: '#F9A825',
    fontSize: 16,
    fontWeight: '600',
  },
  plannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9A825',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1B20',
    textAlign: 'center',
  },
  headerPlaceholder: {
    width: 40,
  },
  plannedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
  },
});

