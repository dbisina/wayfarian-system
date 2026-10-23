import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import ClipCard from '../components/dw/ClipCard';
import Icon from '../components/dw/Icon';
import { AMBER, CREAM, F, INK, shadow, useDW } from '../constants/design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from '../services/api';
import OfflineQueueService from '../services/offlineQueueService';

// Cache key for offline support
const FUTURE_RIDES_CACHE_KEY = 'wayfarian_future_rides_cache';

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

  const fetchRides = async (useCache = true) => {
    // 1. Load from cache first for instant display (offline support)
    if (useCache && !refreshing) {
      try {
        const cached = await AsyncStorage.getItem(FUTURE_RIDES_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setRides(parsed.rides || []);
          console.log('[FutureRides] Loaded from cache:', parsed.rides?.length || 0, 'rides');
        }
      } catch (e) {
        console.warn('[FutureRides] Failed to load cache:', e);
      }
    }

    // 2. Check if online before fetching
    if (!OfflineQueueService.isOnline()) {
      console.log('[FutureRides] Offline - using cached data only');
      setLoading(false);
      setRefreshing(false);
      return;
    }

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
        // Store full journey data for offline starting
        startLatitude: j.startLatitude,
        startLongitude: j.startLongitude,
        endLatitude: j.endLatitude,
        endLongitude: j.endLongitude,
        vehicle: j.vehicle,
        notes: j.notes,
      }));

      // Sort by date, with READY_TO_START first
      mappedRides.sort((a, b) => {
        if (a.status === 'READY_TO_START' && b.status !== 'READY_TO_START') return -1;
        if (a.status !== 'READY_TO_START' && b.status === 'READY_TO_START') return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      setRides(mappedRides);

      // 3. Cache the data for offline access
      AsyncStorage.setItem(FUTURE_RIDES_CACHE_KEY, JSON.stringify({
        rides: mappedRides,
        timestamp: Date.now(),
      })).catch(e => console.warn('[FutureRides] Failed to cache:', e));

    } catch (error: any) {
      console.warn('[FutureRides] Failed to fetch:', error);
      // Only show error if we have no cached data
      if (rides.length === 0) {
        Alert.alert('Error', 'Failed to load upcoming rides. Please check your connection.');
      }
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
        // Navigate to active journey screen with params to force recognition
        router.push({
          pathname: '/journey',
          params: { activeJourneyId: journeyId }
        });
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

  const d = useDW();
  const [next, ...later] = rides;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const has = rides.some((r) => new Date(r.date).toDateString() === day.toDateString());
    return { l: day.toLocaleDateString(undefined, { weekday: 'narrow' }), n: day.getDate(), today: i === 0, has };
  });
  const daysTo = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={[styles.h1, { color: d.ink }]}>Planned rides</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AMBER} />
        </View>
      ) : (
        <FlatList
          data={later}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 0 }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListHeaderComponent={
            <View style={{ gap: 14, marginBottom: 14 }}>
              <View style={styles.week} accessibilityLabel="This week">
                {week.map((w, i) => (
                  <View key={i} style={[styles.weekDay, { backgroundColor: w.today ? d.ink : d.surface }]}>
                    <Text style={[styles.weekL, { color: w.today ? d.bg : d.ink }]}>{w.l}</Text>
                    <Text style={[styles.weekN, { color: w.today ? d.bg : d.ink }]}>{w.n}</Text>
                    <View style={[styles.weekDot, { backgroundColor: w.has ? AMBER : 'transparent' }]} />
                  </View>
                ))}
              </View>

              {next ? (
                <ClipCard color={AMBER} corner={22} radius={24}>
                  <View style={{ padding: 18, gap: 14 }}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.nextEyebrow}>
                          Next up · {new Date(next.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                        </Text>
                        <Text style={styles.nextTitle} numberOfLines={2}>{next.title}</Text>
                        <Text style={styles.nextSub}>{next.groupName} · {next.location}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.nextDays}>{daysTo(next.date)}d</Text>
                        <Text style={styles.nextGo}>to go</Text>
                      </View>
                    </View>
                    <View style={styles.rowBetween}>
                      <Text style={styles.nextWhen}>Leaves {hm(next.date)}</Text>
                      <TouchableOpacity
                        onPress={() => handleStartJourney(next.id, next.status === 'PLANNED')}
                        disabled={startingJourneyId === next.id}
                        accessibilityRole="button"
                        style={styles.nextBtn}
                      >
                        {startingJourneyId === next.id ? (
                          <ActivityIndicator color={CREAM} />
                        ) : (
                          <Text style={styles.nextBtnText}>{next.status === 'READY_TO_START' ? 'Start ride' : 'Start now'}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </ClipCard>
              ) : (
                <Text style={[styles.empty, { color: d.ink2 }]}>No upcoming rides scheduled. Plan a journey to see it here.</Text>
              )}

              {later.length > 0 && <Text style={[styles.eyebrow, { color: d.ink2 }]}>Later</Text>}
            </View>
          }
          renderItem={({ item }) => {
            const dt = new Date(item.date);
            return (
              <TouchableOpacity
                onPress={() => handleStartJourney(item.id, item.status === 'PLANNED')}
                accessibilityRole="button"
                style={[styles.laterRow, { borderTopColor: d.line }]}
              >
                <View style={[styles.dateTile, { backgroundColor: d.surface, borderColor: d.line }]}>
                  <Text style={[styles.mon, { color: d.ink2 }]}>{dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text>
                  <Text style={[styles.day, { color: d.ink }]}>{String(dt.getDate()).padStart(2, '0')}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.laterTitle, { color: d.ink }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.laterMeta, { color: d.ink2 }]} numberOfLines={1}>{item.groupName} · {hm(item.date)}</Text>
                </View>
                <Text style={[styles.laterWho, { color: d.ink2 }]}>{getTimeUntil(item.date)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity
        onPress={() => router.push('/new-journey')}
        accessibilityRole="button"
        style={[styles.plan, { backgroundColor: d.ink, bottom: Math.max(30, insets.bottom + 10) }]}
      >
        <Icon name="plus" size={16} color={d.bg} stroke={3} />
        <Text style={[styles.planText, { color: d.bg }]}>Plan a ride</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.black, fontSize: 28, letterSpacing: -0.6 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  week: { flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 2 },
  weekL: { fontFamily: F.extra, fontSize: 11 },
  weekN: { fontFamily: F.monoBold, fontSize: 17 },
  weekDot: { width: 5, height: 5, borderRadius: 3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  nextEyebrow: { fontFamily: F.black, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: INK },
  nextTitle: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: INK },
  nextSub: { fontFamily: F.semi, fontSize: 13, color: 'rgba(26,24,20,0.72)' },
  nextDays: { fontFamily: F.monoBold, fontSize: 26, lineHeight: 34, color: INK },
  nextGo: { fontFamily: F.bold, fontSize: 12, color: INK },
  nextWhen: { fontFamily: F.extra, fontSize: 13, color: INK },
  nextBtn: { height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: INK, justifyContent: 'center' },
  nextBtnText: { fontFamily: F.extra, fontSize: 13, color: CREAM },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 4 },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', paddingVertical: 30 },
  laterRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: 1 },
  dateTile: { width: 52, height: 56, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mon: { fontFamily: F.black, fontSize: 10, letterSpacing: 0.8 },
  day: { fontFamily: F.monoBold, fontSize: 20 },
  laterTitle: { fontFamily: F.extra, fontSize: 16 },
  laterMeta: { fontFamily: F.regular, fontSize: 12 },
  laterWho: { fontFamily: F.extra, fontSize: 12 },
  plan: { position: 'absolute', left: 16, right: 16, height: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  planText: { fontFamily: F.black, fontSize: 16 },
});
