// app/app/group-journey.tsx
// Dedicated group journey screen with resilient socket syncing

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../contexts/AuthContext';
import { useGroupJourney } from '../hooks/useGroupJourney';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { getSocket } from '../services/socket';
import { apiRequest, galleryAPI } from '../services/api';
import { getGoogleMapsApiKey } from '../services/directions';
import JourneyCamera from '../components/JourneyCamera';

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
}

export default function GroupJourneyScreen() {
  const params = useLocalSearchParams<{ groupJourneyId?: string }>();
  const groupJourneyId =
    typeof params.groupJourneyId === "string"
      ? params.groupJourneyId
      : undefined;
  const router = useRouter();
  const { user } = useAuth();
  const socket = getSocket();
  const googleKey = getGoogleMapsApiKey();

  const [journeyData, setJourneyData] = useState<GroupJourneyData | null>(null);
  const [manualRouteCoords, setManualRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [initialRegionSet, setInitialRegionSet] = useState(false);

  const mapRef = useRef<MapView>(null);
  const hasCenteredOnUser = useRef(false);

  const {
    memberLocations,
    myInstance,
    isTracking,
    startLocationTracking,
    stopLocationTracking,
    setMyInstance,
  } = useGroupJourney({ socket, groupJourneyId, autoStart: true });

  useRealtimeEvents({ groupJourneyId });

  const [showCamera, setShowCamera] = useState(false);

  const handlePhotoTaken = useCallback(
    async (photoData: { uri: string; latitude: number; longitude: number }) => {
      if (!groupJourneyId) return;
      try {
        const formData = new FormData();
        
        // Correct file field name and structure
        formData.append('photo', {
          uri: photoData.uri,
          type: 'image/jpeg',
          name: `journey_photo_${Date.now()}.jpg`,
        } as any);
        
        formData.append('latitude', String(photoData.latitude));
        formData.append('longitude', String(photoData.longitude));
        formData.append('journeyId', groupJourneyId);
        
        // Use the dedicated gallery API function
        const uploadResponse = await galleryAPI.uploadPhoto(formData);

        if (!uploadResponse?.success) {
          throw new Error('Upload failed');
        }

        const mediaUrl =
          uploadResponse?.photo?.imageUrl ||
          uploadResponse?.photo?.firebasePath ||
          photoData.uri;

        // Create ride event for the photo
        await apiRequest(`/group-journey/${groupJourneyId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'PHOTO',
            message: 'Shared a photo',
            latitude: photoData.latitude,
            longitude: photoData.longitude,
            mediaUrl,
          }),
        });

        Alert.alert('Success', 'Photo shared with group!');
      } catch (error) {
        console.warn('Failed to upload group photo', error);
        Alert.alert('Error', 'Failed to upload photo');
      } finally {
        setShowCamera(false);
      }
    },
    [groupJourneyId]
  );

  const initialMapRegion = useMemo<Region | null>(() => {
    if (!journeyData) return null;
    return {
      latitude: journeyData.startLatitude,
      longitude: journeyData.startLongitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [journeyData]);

  const [region, setRegion] = useState<Region | null>(initialMapRegion);

  useEffect(() => {
    if (initialMapRegion) {
      setRegion(initialMapRegion);
    }
  }, [initialMapRegion]);


  const animateRegion = useCallback(
    (
      coords?: { latitude?: number; longitude?: number },
      delta: number = 0.04
    ) => {
      if (!coords?.latitude || !coords?.longitude) return;
      const nextRegion = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 800);
    },
    []
  );

  const fetchJourney = useCallback(async () => {
    if (!groupJourneyId) return;
    try {
      setLoading(true);
      const response = await apiRequest(`/group-journey/${groupJourneyId}`, {
        method: "GET",
      });
      if (!response?.groupJourney) {
        throw new Error("Journey not found");
      }
      setJourneyData(response.groupJourney);
      const mine = response.groupJourney.instances?.find(
        (inst: any) => inst.userId === user?.id
      );
      if (mine) {
        setMyInstance(mine);
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to load group journey");
    } finally {
      setLoading(false);
    }
  }, [groupJourneyId, setMyInstance, user?.id]);

  useEffect(() => {
    fetchJourney();
  }, [fetchJourney]);

  const destination = useMemo(() => {
    if (journeyData?.endLatitude && journeyData?.endLongitude) {
      return {
        latitude: journeyData.endLatitude,
        longitude: journeyData.endLongitude,
      };
    }
    return undefined;
  }, [journeyData?.endLatitude, journeyData?.endLongitude]);

  const myLocation = useMemo(
    () =>
      memberLocations.find(
        (m) =>
          m.userId === user?.id &&
          typeof m.latitude === "number" &&
          typeof m.longitude === "number"
      ),
    [memberLocations, user?.id]
  );

  const directionOrigin = useMemo(() => {
    if (myLocation?.latitude && myLocation?.longitude) {
      return { latitude: myLocation.latitude, longitude: myLocation.longitude };
    }
    if (journeyData?.startLatitude && journeyData?.startLongitude) {
      return {
        latitude: journeyData.startLatitude,
        longitude: journeyData.startLongitude,
      };
    }
    return undefined;
  }, [
    journeyData?.startLatitude,
    journeyData?.startLongitude,
    myLocation?.latitude,
    myLocation?.longitude,
  ]);

  useEffect(() => {
    if (!destination || !directionOrigin) return;

    const coordinates = [directionOrigin, destination];
    const latitudes = coordinates.map((coord) => coord.latitude);
    const longitudes = coordinates.map((coord) => coord.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latitudeDelta = (maxLat - minLat) * 1.5;
    const longitudeDelta = (maxLng - minLng) * 1.5;

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const routeRegion = {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: Math.max(latitudeDelta, 0.02),
      longitudeDelta: Math.max(longitudeDelta, 0.02),
    };

    setRegion(routeRegion);
    mapRef.current?.animateToRegion(routeRegion, 1000);
  }, [destination, directionOrigin]);

  // Replace the manual route calculation useEffect
  useEffect(() => {
    if (!destination || !directionOrigin) {
      setManualRouteCoords([]);
      return;
    }

    // Always use manual route for consistent display
    const calculateManualRoute = () => {
      // Create a smooth route with intermediate points
      const start = directionOrigin;
      const end = destination;

      // Calculate intermediate points for a curved route
      const midLat = (start.latitude + end.latitude) / 2;
      const midLng = (start.longitude + end.longitude) / 2;

      // Add slight curve to make it look more natural
      const curveFactor = 0.1;
      const curveLat =
        midLat + curveFactor * Math.abs(end.latitude - start.latitude);
      const curveLng =
        midLng + curveFactor * Math.abs(end.longitude - start.longitude);

      const route = [start, { latitude: curveLat, longitude: curveLng }, end];

      setManualRouteCoords(route);

      // Fit map to show the entire route
      mapRef.current?.fitToCoordinates([start, end], {
        edgePadding: { top: 100, right: 50, bottom: 200, left: 50 },
        animated: true,
      });
    };

    calculateManualRoute();
  }, [destination, directionOrigin]);

  useEffect(() => {
    if (initialRegionSet) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setInitialRegionSet(true);
        return;
      }

      // Only center on user if we don't have a route yet
      if (!destination || !directionOrigin) {
        const current = await Location.getCurrentPositionAsync({});
        animateRegion(
          {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          },
          0.03
        );
        hasCenteredOnUser.current = true;
      }
      setInitialRegionSet(true);
    })();
  }, [animateRegion, initialRegionSet, destination, directionOrigin]);

  useEffect(() => {
    if (journeyData?.startLatitude && journeyData?.startLongitude) {
      animateRegion(
        {
          latitude: journeyData.startLatitude,
          longitude: journeyData.startLongitude,
        },
        0.05
      );
    }
  }, [journeyData?.startLatitude, journeyData?.startLongitude, animateRegion]);

  useEffect(() => {
    if (
      myLocation?.latitude &&
      myLocation?.longitude &&
      !hasCenteredOnUser.current
    ) {
      animateRegion(
        { latitude: myLocation.latitude, longitude: myLocation.longitude },
        0.03
      );
      hasCenteredOnUser.current = true;
    }
  }, [myLocation?.latitude, myLocation?.longitude, animateRegion]);

  useEffect(() => {
    if (!myLocation) {
      hasCenteredOnUser.current = false;
    }
  }, [myLocation, journeyData?.id]);

  useEffect(() => {
    if (myInstance?.status === "ACTIVE" && !isTracking && myInstance.id) {
      startLocationTracking(myInstance.id);
    }
  }, [isTracking, myInstance, startLocationTracking]);

  const fitMapToMembers = useCallback(() => {
    if (!mapRef.current) return;
    const coords = memberLocations
      .filter(
        (m) => typeof m.latitude === "number" && typeof m.longitude === "number"
      )
      .map((m) => ({
        latitude: m.latitude as number,
        longitude: m.longitude as number,
      }));
    if (!coords.length) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 60, bottom: 260, left: 60 },
      animated: true,
    });
  }, [memberLocations]);

  useEffect(() => {
    if (memberLocations.length) {
      fitMapToMembers();
    }
  }, [memberLocations.length, fitMapToMembers]);

  const handleStartInstance = async () => {
    if (!groupJourneyId) return;
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const response = await apiRequest(
        `/group-journey/${groupJourneyId}/start-my-instance`,
        {
          method: "POST",
          body: JSON.stringify({
            startLatitude: coords.latitude,
            startLongitude: coords.longitude,
          }),
        }
      );
      if (!response?.instance) throw new Error("Unable to start instance");
      setMyInstance(response.instance);
      startLocationTracking(response.instance.id);
    } catch (error: any) {
      Alert.alert(
        "Unable to start",
        error?.message || "Try again in a moment."
      );
    }
  };

  const handleTogglePause = async () => {
    if (!myInstance) return;
    const endpoint = myInstance.status === "PAUSED" ? "resume" : "pause";
    try {
      await apiRequest(`/group-journey/instance/${myInstance.id}/${endpoint}`, {
        method: "POST",
      });
      if (endpoint === "resume") {
        startLocationTracking(myInstance.id);
        setMyInstance((prev) => (prev ? { ...prev, status: "ACTIVE" } : prev));
      } else {
        stopLocationTracking();
        setMyInstance((prev) => (prev ? { ...prev, status: "PAUSED" } : prev));
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || `Unable to ${endpoint} instance.`);
    }
  };

  const handleComplete = () => {
    if (!myInstance) return;
    Alert.alert(
      "Complete Ride",
      "Stop sharing your location and mark this group journey complete?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          style: "destructive",
          onPress: async () => {
            try {
              stopLocationTracking();
              await apiRequest(
                `/group-journey/instance/${myInstance.id}/complete`,
                { method: "POST" }
              );
              setMyInstance((prev) =>
                prev ? { ...prev, status: "COMPLETED" } : prev
              );
              Alert.alert("Journey complete", "Great ride!");
              router.back();
            } catch (error: any) {
              Alert.alert(
                "Error",
                error?.message || "Unable to complete journey."
              );
            }
          },
        },
      ]
    );
  };

  if (!groupJourneyId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Missing group journey ID.</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading journey…</Text>
      </View>
    );
  }

  if (!journeyData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorText}>Journey not found.</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const completedCount = memberLocations.filter(
    (m) => m.status === "COMPLETED"
  ).length;
  const totalMembers =
    memberLocations.length || journeyData.instances?.length || 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: journeyData.title, headerShown: true }} />
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        region={(region ?? initialMapRegion ?? undefined) as Region | undefined}
        initialRegion={(initialMapRegion ?? undefined) as Region | undefined}
        onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)}
        showsUserLocation
        showsCompass
      >
        {Platform.OS === "android" &&
        destination &&
        directionOrigin &&
        googleKey ? (
          <MapViewDirections
            origin={directionOrigin}
            destination={destination}
            apikey={googleKey}
            strokeWidth={4}
            strokeColor="#6366f1"
          />
        ) : destination && manualRouteCoords.length > 1 ? (
          <Polyline
            coordinates={manualRouteCoords}
            strokeWidth={4}
            strokeColor="#6366f1"
          />
        ) : null}

        <Marker
          coordinate={{
            latitude: journeyData.startLatitude,
            longitude: journeyData.startLongitude,
          }}
          title="Start"
          pinColor="green"
        />

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

        {memberLocations.map((member) => {
          if (
            typeof member.latitude !== "number" ||
            typeof member.longitude !== "number"
          )
            return null;
          return (
            <Marker
              key={member.userId}
              coordinate={{
                latitude: member.latitude,
                longitude: member.longitude,
              }}
              title={member.displayName}
              description={`${((member.totalDistance || 0) / 1000).toFixed(
                1
              )} km • ${member.status}`}
            >
              <View style={styles.memberMarker}>
                <Image
                  source={
                    member.photoURL
                      ? { uri: member.photoURL }
                      : require("../assets/images/2025-09-26/byc45z4XPi.png")
                  }
                  style={styles.memberImage}
                />
                {member.status === "COMPLETED" && (
                  <MaterialIcons
                    name="check-circle"
                    size={18}
                    color="#10b981"
                    style={styles.statusBadge}
                  />
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.topPanel}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Progress</Text>
            <Text style={styles.statValue}>
              {completedCount}/{totalMembers}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Your distance</Text>
            <Text style={styles.statValue}>
              {myLocation
                ? ((myLocation.totalDistance || 0) / 1000).toFixed(1)
                : "0.0"}{" "}
              km
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, styles.statusValue]}>
              {myInstance?.status || "NOT STARTED"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.memberPanel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {memberLocations.map((member) => (
            <View key={member.userId} style={styles.memberCard}>
              <Image
                source={
                  member.photoURL
                    ? { uri: member.photoURL }
                    : require("../assets/images/2025-09-26/byc45z4XPi.png")
                }
                style={styles.memberAvatar}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {member.displayName}
              </Text>
              <Text style={styles.memberDistance}>
                {((member.totalDistance || 0) / 1000).toFixed(1)} km
              </Text>
              {member.status === "COMPLETED" && (
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {!myInstance && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartInstance}
        >
          <Text style={styles.startButtonText}>Start your ride</Text>
        </TouchableOpacity>
      )}

      {myInstance && myInstance.status !== "COMPLETED" && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, styles.cameraButton]}
            onPress={() => setShowCamera(true)}
          >
            <Ionicons name="camera" size={22} color="#fff" />
            <Text style={styles.controlButtonText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, styles.pauseButton]}
            onPress={handleTogglePause}
          >
            <Ionicons
              name={myInstance.status === "PAUSED" ? "play" : "pause"}
              size={22}
              color="#fff"
            />
            <Text style={styles.controlButtonText}>
              {myInstance.status === "PAUSED" ? "Resume" : "Pause"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, styles.completeButton]}
            onPress={handleComplete}
          >
            <Ionicons name="checkmark" size={22} color="#fff" />
            <Text style={styles.controlButtonText}>Complete</Text>
          </TouchableOpacity>
        </View>
      )}

      {showCamera && groupJourneyId && (
        <View style={styles.cameraOverlay}>
          <JourneyCamera
            journeyId={groupJourneyId}
            journeyType="group"
            onPhotoTaken={handlePhotoTaken}
            onClose={() => setShowCamera(false)}
          />
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
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6366f1',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  topPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Platform.OS === 'android' ? '#fff' : 'rgba(255,255,255,0.95)',
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
  statusValue: {
    color: '#6366f1',
  },
  memberPanel: {
    position: 'absolute',
    bottom: 170,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: Platform.OS === 'android' ? '#fff' : 'rgba(255,255,255,0.95)',
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
  memberName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  memberDistance: {
    fontSize: 11,
    color: '#6b7280',
  },
  memberMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#fff',
  },
  statusBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
  },
  startButton: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  cameraButton: {
    backgroundColor: '#8b5cf6',
  },
  pauseButton: {
    backgroundColor: '#f59e0b',
  },
  completeButton: {
    backgroundColor: '#16a34a',
  },
  controlButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    zIndex: 10,
  },
});
