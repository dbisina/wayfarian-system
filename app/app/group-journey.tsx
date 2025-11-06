// app/app/group-journey.tsx
// Group Journey Screen - Real-time journey with all member locations

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useGroupJourney } from '../hooks/useGroupJourney';
import { getSocket } from '../services/socket';
import { apiRequest } from '../services/api';
import { getGoogleMapsApiKey } from '../services/directions';

interface GroupJourneyData {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  status: string;
  startLatitude: number;
  startLongitude: number;
  endLatitude?: number;
  endLongitude?: number;
  instances: any[];
  members: any[];
}

export default function GroupJourneyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const socket = getSocket();
  
  const groupJourneyId = params.groupJourneyId as string;
  const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

  const [journeyData, setJourneyData] = useState<GroupJourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [myInstanceId, setMyInstanceId] = useState<string | null>(null);
  
  const mapRef = useRef<MapView>(null);

  const {
    isJoined,
    memberLocations,
    myInstance,
    isTracking,
    startLocationTracking,
    stopLocationTracking,
    setMyInstance,
    setGroupJourney,
  } = useGroupJourney({
    socket,
    groupJourneyId,
    autoStart: true,
  });

  /**
   * Fetch journey details
   */
  const fetchJourneyDetails = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await apiRequest(`/group-journey/${groupJourneyId}`, {
        method: 'GET',
      });

      if (response.success) {
        setJourneyData(response.groupJourney);
        setGroupJourney(response.groupJourney);

        // Find my instance
        const mine = response.groupJourney.instances.find(
          (inst: any) => inst.userId === user?.id
        );
        if (mine) {
          setMyInstanceId(mine.id);
          setMyInstance(mine);
        }
      }
    } catch (error) {
      if (!silent) {
        console.error('Failed to fetch journey:', error);
        Alert.alert('Error', 'Failed to load group journey');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [groupJourneyId, user, setGroupJourney, setMyInstance]);

  /**
   * Complete my journey
   */
  const handleCompleteJourney = useCallback(async () => {
    if (!myInstanceId) return;

    Alert.alert(
      'Complete Journey',
      'Are you sure you want to complete your journey?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          style: 'default',
          onPress: async () => {
            try {
              stopLocationTracking();
              
              const response = await apiRequest(
                `/group-journey/instance/${myInstanceId}/complete`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    endLatitude: myInstance?.currentLatitude,
                    endLongitude: myInstance?.currentLongitude,
                  }),
                }
              );

              if (response.success) {
                Alert.alert(
                  'Journey Complete!',
                  `Distance: ${(response.instance.totalDistance / 1000).toFixed(2)} km\nTime: ${Math.floor(response.instance.totalTime / 60)} min`,
                  [
                    {
                      text: 'View Results',
                      onPress: () => router.back(),
                    },
                  ]
                );
              }
            } catch (error) {
              console.error('Complete journey error:', error);
              Alert.alert('Error', 'Failed to complete journey');
            }
          },
        },
      ]
    );
  }, [myInstanceId, myInstance, stopLocationTracking, router]);

  /**
   * Pause/Resume journey
   */
  const togglePause = useCallback(async () => {
    if (!myInstanceId) return;

    const isPaused = myInstance?.status === 'PAUSED';
    const endpoint = isPaused ? 'resume' : 'pause';

    try {
      if (isPaused) {
        await apiRequest(`/group-journey/instance/${myInstanceId}/${endpoint}`, {
          method: 'POST',
        });
        startLocationTracking(myInstanceId);
      } else {
        stopLocationTracking();
        await apiRequest(`/group-journey/instance/${myInstanceId}/${endpoint}`, {
          method: 'POST',
        });
      }
    } catch (error) {
      console.error('Toggle pause error:', error);
      Alert.alert('Error', `Failed to ${endpoint} journey`);
    }
  }, [myInstanceId, myInstance, startLocationTracking, stopLocationTracking]);

  /**
   * Fit map to show all members
   */
  const fitMapToMembers = useCallback(() => {
    if (!mapRef.current || memberLocations.length === 0) return;

    const coordinates = memberLocations
      .filter(m => m.latitude && m.longitude)
      .map(m => ({
        latitude: m.latitude,
        longitude: m.longitude,
      }));

    if (coordinates.length > 0) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
        animated: true,
      });
    }
  }, [memberLocations]);

  /**
   * Initialize
   */
  useEffect(() => {
    fetchJourneyDetails();
  }, [fetchJourneyDetails]);

  /**
   * Auto-refresh journey data every 5 seconds (silent background updates)
   */
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJourneyDetails(true); // Silent refresh - no loading spinner
    }, 30000); // Throttle to every 30 seconds to reduce API pressure
    
    return () => clearInterval(interval);
  }, [fetchJourneyDetails]);

  /**
   * Start tracking when joined
   */
  useEffect(() => {
    if (isJoined && myInstanceId && myInstance?.status === 'ACTIVE' && !isTracking) {
      startLocationTracking(myInstanceId);
    }
  }, [isJoined, myInstanceId, myInstance, isTracking, startLocationTracking]);

  /**
   * Fit map when members update
   */
  useEffect(() => {
    if (memberLocations.length > 0) {
      fitMapToMembers();
    }
  }, [memberLocations.length, fitMapToMembers]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading journey...</Text>
      </View>
    );
  }

  if (!journeyData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Journey not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const myLocation = memberLocations.find(m => m.userId === user?.id);
  const completedCount = memberLocations.filter(m => m.status === 'COMPLETED').length;
  const totalMembers = memberLocations.length;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: journeyData.title,
          headerShown: true,
        }}
      />

      {/* Map showing all members */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={{
          latitude: journeyData.startLatitude,
          longitude: journeyData.startLongitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass
        showsScale
      >
        {/* Directions from start to destination */}
        {Platform.OS === 'android' && journeyData.endLatitude && journeyData.endLongitude && GOOGLE_MAPS_API_KEY && (
          <MapViewDirections
            origin={{
              latitude: journeyData.startLatitude,
              longitude: journeyData.startLongitude,
            }}
            destination={{
              latitude: journeyData.endLatitude,
              longitude: journeyData.endLongitude,
            }}
            apikey={GOOGLE_MAPS_API_KEY}
            mode="DRIVING"
            strokeWidth={5}
            strokeColor="#6366f1"
            optimizeWaypoints
            onReady={(result) => {
              try {
                mapRef.current?.fitToCoordinates(result.coordinates, {
                  edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
                  animated: true,
                });
              } catch {}
            }}
            onError={(err) => console.warn('Directions error:', err)}
          />
        )}

        {/* Start marker */}
        <Marker
          coordinate={{
            latitude: journeyData.startLatitude,
            longitude: journeyData.startLongitude,
          }}
          title="Start"
          pinColor="green"
        />

        {/* End marker */}
        {journeyData.endLatitude && journeyData.endLongitude && (
          <Marker
            coordinate={{
              latitude: journeyData.endLatitude,
              longitude: journeyData.endLongitude,
            }}
            title="Destination"
            pinColor="red"
          />
        )}

        {/* Member markers with profile pictures */}
        {memberLocations.map((member) => {
          if (!member.latitude || !member.longitude) return null;

          return (
            <Marker
              key={member.userId}
              coordinate={{
                latitude: member.latitude,
                longitude: member.longitude,
              }}
              title={member.displayName}
              description={`${(member.totalDistance / 1000).toFixed(2)} km • ${member.status}`}
            >
              <View style={styles.memberMarker}>
                {member.photoURL ? (
                  <Image source={{ uri: member.photoURL }} style={styles.memberImage} />
                ) : (
                  <View style={styles.memberPlaceholder}>
                    <Text style={styles.memberInitial}>
                      {member.displayName?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                {member.status === 'COMPLETED' && (
                  <View style={styles.completedBadge}>
                    <Ionicons name="checkmark" size={12} color="white" />
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Top info panel */}
      <View style={styles.topPanel}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Progress</Text>
            <Text style={styles.statValue}>
              {completedCount}/{totalMembers}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Your Distance</Text>
            <Text style={styles.statValue}>
              {myLocation ? (myLocation.totalDistance / 1000).toFixed(2) : '0.00'} km
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, styles.statusText]}>
              {myInstance?.status || 'UNKNOWN'}
            </Text>
          </View>
        </View>
      </View>

      {/* Member list */}
      <View style={styles.memberPanel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {memberLocations.map((member) => (
            <View key={member.userId} style={styles.memberCard}>
              {member.photoURL ? (
                <Image source={{ uri: member.photoURL }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>
                    {member.displayName?.[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.memberName} numberOfLines={1}>
                {member.displayName}
              </Text>
              <Text style={styles.memberDistance}>
                {(member.totalDistance / 1000).toFixed(1)} km
              </Text>
              {member.status === 'COMPLETED' && (
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Control buttons */}
      <View style={styles.controls}>
        {myInstance?.status !== 'COMPLETED' && (
          <>
            <TouchableOpacity
              style={[styles.controlButton, styles.pauseButton]}
              onPress={togglePause}
            >
              <Ionicons
                name={myInstance?.status === 'PAUSED' ? 'play' : 'pause'}
                size={24}
                color="white"
              />
              <Text style={styles.controlButtonText}>
                {myInstance?.status === 'PAUSED' ? 'Resume' : 'Pause'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.completeButton]}
              onPress={handleCompleteJourney}
            >
              <Ionicons name="checkmark" size={24} color="white" />
              <Text style={styles.controlButtonText}>Complete</Text>
            </TouchableOpacity>
          </>
        )}

        {myInstance?.status === 'COMPLETED' && (
          <TouchableOpacity
            style={[styles.controlButton, styles.backButton]}
            onPress={() => router.back()}
          >
            <Text style={styles.controlButtonText}>Back to Group</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tracking indicator */}
      {isTracking && (
        <View style={styles.trackingIndicator}>
          <View style={styles.trackingDot} />
          <Text style={styles.trackingText}>Tracking Location</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#374151',
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  topPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statusText: {
    color: '#6366f1',
  },
  memberPanel: {
    position: 'absolute',
    bottom: 160,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  memberCard: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 80,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  avatarPlaceholder: {
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  memberDistance: {
    fontSize: 11,
    color: '#6b7280',
  },
  memberMarker: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: '#6366f1',
  },
  memberPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  memberInitial: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  completedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  controls: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  pauseButton: {
    backgroundColor: '#f59e0b',
  },
  completeButton: {
    backgroundColor: '#10b981',
  },
  backButton: {
    backgroundColor: '#6366f1',
  },
  controlButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  trackingIndicator: {
    position: 'absolute',
    top: 120,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 8,
  },
  trackingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});
