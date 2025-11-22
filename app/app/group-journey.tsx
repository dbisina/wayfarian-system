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
import { useSettings } from '../contexts/SettingsContext';
import { useGroupJourney } from '../hooks/useGroupJourney';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { getSocket } from '../services/socket';
import { apiRequest, galleryAPI } from '../services/api';
import { fetchDirections, getGoogleMapsApiKey } from '../services/directions';
import JourneyCamera from '../components/JourneyCamera';
import LocationPicker from '../components/LocationPicker';
import { useGroupMapBehavior } from '../components/map/GroupMapBehavior';
import { SpeedLimitSign } from '../components/ui/SpeedLimitSign';

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
  const { convertDistance } = useSettings();
  const socket = getSocket();
  const googleKey = getGoogleMapsApiKey();

  const [journeyData, setJourneyData] = useState<GroupJourneyData | null>(null);
  const [manualRouteCoords, setManualRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isLocatingUser, setIsLocatingUser] = useState(true);
  const [userStartRegion, setUserStartRegion] = useState<Region | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region | null>(null);

  const {
    memberLocations,
    myInstance,
    isTracking,
    startLocationTracking,
    stopLocationTracking,
    setMyInstance,
  } = useGroupJourney({ socket, groupJourneyId, autoStart: true });

  // Group Map Behavior (Zoom Wars Fix)
  const { mapViewProps } = useGroupMapBehavior({
    mapRef: mapRef as React.RefObject<MapView>,
    members: memberLocations
      .filter(m => typeof m.latitude === 'number' && typeof m.longitude === 'number')
      .map(m => ({ latitude: m.latitude!, longitude: m.longitude!, id: m.userId })),
    currentUserLocation: region ? { latitude: region.latitude, longitude: region.longitude } : null,
    isGroupJourney: true,
  });

  useRealtimeEvents({ groupJourneyId });

  const [showCamera, setShowCamera] = useState(false);
  const [showStartLocationModal, setShowStartLocationModal] = useState(false);
  const [userStartLocation, setUserStartLocation] = useState<{ latitude: number; longitude: number; address?: string } | null>(null);

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
    // Ignore placeholder coordinates (0,0)
    if (Math.abs(journeyData.startLatitude) < 0.0001 && Math.abs(journeyData.startLongitude) < 0.0001) {
      return null;
    }
    return {
      latitude: journeyData.startLatitude,
      longitude: journeyData.startLongitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [journeyData]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;
        if (status !== 'granted') {
          setLocationError('Location permission denied');
          return;
        }

        const current = await Location.getCurrentPositionAsync({});
        if (!isMounted) return;

        const bootstrapRegion = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };

        setUserStartRegion(bootstrapRegion);
        setRegion(bootstrapRegion);
      } catch (error) {
        if (isMounted) {
          console.warn('Unable to determine current location', error);
          setLocationError('Unable to determine current location');
        }
      } finally {
        if (isMounted) {
          setIsLocatingUser(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

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

  // Direction origin: Only show route for current user from their current/start location
  const directionOrigin = useMemo(() => {
    // If completed, don't show route
    if (myInstance?.status === "COMPLETED") {
      return undefined;
    }
    
    // Priority 1: User's real-time location from memberLocations (most accurate)
    if (myLocation?.latitude && myLocation?.longitude) {
      return { latitude: myLocation.latitude, longitude: myLocation.longitude };
    }
    // Priority 2: User's current region (from GPS)
    if (region) {
      return { latitude: region.latitude, longitude: region.longitude };
    }
    // Priority 3: User's current location from instance (if available)
    if (myInstance?.currentLatitude && myInstance?.currentLongitude) {
      return { 
        latitude: myInstance.currentLatitude, 
        longitude: myInstance.currentLongitude 
      };
    }
    // Priority 4: User's start location (from userStartRegion or instance startLatitude if available)
    if (userStartRegion) {
      return { latitude: userStartRegion.latitude, longitude: userStartRegion.longitude };
    }
    // Fallback: Check if instance has startLatitude (from TypeScript interface, may not be in DB)
    if (myInstance?.startLatitude && myInstance?.startLongitude) {
      return { 
        latitude: myInstance.startLatitude, 
        longitude: myInstance.startLongitude 
      };
    }
    return undefined;
  }, [
    myInstance?.id,
    myInstance?.status,
    myInstance?.currentLatitude,
    myInstance?.currentLongitude,
    myInstance?.startLatitude,
    myInstance?.startLongitude,
    myLocation?.latitude,
    myLocation?.longitude,
    userStartRegion,
    region,
  ]);


  // Fetch directions for iOS or when Google Maps API is not available
  // Android uses MapViewDirections which automatically updates when origin changes
  useEffect(() => {
    if (!destination || !directionOrigin) {
      setManualRouteCoords([]);
      return;
    }

    // Only fetch manual directions for iOS or when Google key is not available
    // Android uses MapViewDirections which handles updates automatically
    const shouldUseManualDirections = Platform.OS !== 'android' || !googleKey;
    if (!shouldUseManualDirections) {
      setManualRouteCoords([]);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const result = await fetchDirections(directionOrigin, destination, {
          mode: 'driving',
          apiKey: googleKey,
        });

        if (!isMounted) return;

        if (result?.coordinates?.length) {
          setManualRouteCoords(result.coordinates);
        }
      } catch (error) {
        console.warn('Failed to fetch directions for group journey', error);
        // Keep previous route coords on error to avoid flickering
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [destination, directionOrigin, googleKey]);

  const regionFromCoords = useCallback(
    (
      coords: { latitude: number; longitude: number }[],
      paddingMultiplier: number = 1.3
    ): Region | null => {
      if (!coords.length) return null;
      if (coords.length === 1) {
        const [coord] = coords;
        return {
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
      }

      const latitudes = coords.map((c) => c.latitude);
      const longitudes = coords.map((c) => c.longitude);
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLng = Math.min(...longitudes);
      const maxLng = Math.max(...longitudes);

      const latitudeDelta = Math.max((maxLat - minLat) * paddingMultiplier, 0.02);
      const longitudeDelta = Math.max((maxLng - minLng) * paddingMultiplier, 0.02);

      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta,
        longitudeDelta,
      };
    },
    []
  );

  const targetRegion = useMemo(() => {
    // Priority 1: Real-time location when actively tracking (follow user movement)
    if (isTracking && myLocation?.latitude && myLocation?.longitude) {
      return {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    // Priority 2: User's initial location (fallback when not tracking)
    if (userStartRegion) {
      return userStartRegion;
    }
    // Priority 3: Route coordinates if available
    if (manualRouteCoords.length >= 2) {
      return regionFromCoords(manualRouteCoords, 1.2);
    }
    // Priority 4: Direction origin and destination
    if (directionOrigin && destination) {
      return regionFromCoords([directionOrigin, destination], 1.4);
    }
    // Priority 5: Journey start location
    return initialMapRegion;
  }, [
    destination,
    directionOrigin,
    initialMapRegion,
    isTracking,
    manualRouteCoords,
    myLocation?.latitude,
    myLocation?.longitude,
    regionFromCoords,
    userStartRegion,
  ]);

  useEffect(() => {
    if (!targetRegion) return;
    setRegion(targetRegion);
    mapRef.current?.animateToRegion(targetRegion, 800);
  }, [targetRegion]);



  useEffect(() => {
    if (myInstance?.status === "ACTIVE" && !isTracking && myInstance.id) {
      startLocationTracking(myInstance.id);
    }
  }, [isTracking, myInstance, startLocationTracking]);

  const [isStarting, setIsStarting] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleStartInstance = async () => {
    if (!groupJourneyId || !userStartLocation) {
      Alert.alert("Error", "Please select your start location first");
      return;
    }
    setIsStarting(true);
    try {
      const response = await apiRequest(
        `/group-journey/${groupJourneyId}/start-my-instance`,
        {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startLatitude: userStartLocation.latitude,
            startLongitude: userStartLocation.longitude,
            startAddress: userStartLocation.address || undefined,
          }),
        }
      );
      if (!response?.instance) {
        throw new Error(response?.error || response?.message || "Unable to start instance");
      }
      setMyInstance(response.instance);
      startLocationTracking(response.instance.id);
      setShowStartLocationModal(false);
    } catch (error: any) {
      console.error('Start instance error:', error);
      const errorMessage = error?.response?.data?.message || error?.message || "Try again in a moment.";
      Alert.alert(
        "Unable to start",
        errorMessage
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleTogglePause = async () => {
    if (!myInstance) return;
    setIsPausing(true);
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
    } finally {
      setIsPausing(false);
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
            setIsCompleting(true);
            try {
              // Stop location tracking first
              stopLocationTracking();
              
              // Get current location for end coordinates
              const currentLocation = myLocation || (region ? { latitude: region.latitude, longitude: region.longitude } : null);
              
              // Prepare request body - only include coordinates if they're valid numbers
              const requestBody: { endLatitude?: number; endLongitude?: number } = {};
              if (currentLocation?.latitude != null && typeof currentLocation.latitude === 'number' && !isNaN(currentLocation.latitude)) {
                requestBody.endLatitude = currentLocation.latitude;
              }
              if (currentLocation?.longitude != null && typeof currentLocation.longitude === 'number' && !isNaN(currentLocation.longitude)) {
                requestBody.endLongitude = currentLocation.longitude;
              }
              
              // Call complete endpoint - backend expects JSON body and returns { success: true, instance: {...} }
              const response = await apiRequest(
                `/group-journey/instance/${myInstance.id}/complete`,
                {
                  method: "POST",
                  body: requestBody,
                }
              );
              
              if (!response || !response.success) {
                throw new Error(response?.error || response?.message || "Failed to complete journey");
              }
              
              // Clear all journey state for fresh start
              setMyInstance(null);
              setJourneyData(null);
              // Note: memberLocations is managed by useGroupJourney hook, will clear automatically
              setRegion(null);
              setManualRouteCoords([]);
              
              Alert.alert("Journey complete", "Great ride!");
              router.back();
            } catch (error: any) {
              console.error('[GroupJourney] Complete error:', error);
              const errorMessage = error?.response?.data?.message || 
                                 error?.response?.data?.error || 
                                 error?.message || 
                                 "Unable to complete journey. Please try again.";
              Alert.alert("Error", errorMessage);
            } finally {
              setIsCompleting(false);
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

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>
          {isLocatingUser
            ? 'Getting your location…'
            : locationError || 'Preparing map…'}
        </Text>
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
        region={region}
        initialRegion={region}
        // onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)} // Handled by mapViewProps
        showsUserLocation
        showsCompass
        {...mapViewProps}
        onRegionChangeComplete={(r) => {
            setRegion(r);
            mapViewProps.onRegionChangeComplete(r);
        }}
      >
        {/* Show route from user's current location to destination */}
        {myInstance?.status !== "COMPLETED" && 
        destination &&
        directionOrigin ? (
          Platform.OS === "android" && googleKey ? (
            <MapViewDirections
              key={`${directionOrigin.latitude}-${directionOrigin.longitude}-${destination.latitude}-${destination.longitude}`}
              origin={directionOrigin}
              destination={destination}
              apikey={googleKey}
              strokeWidth={4}
              strokeColor="#F9A825"
              mode="DRIVING"
              optimizeWaypoints={true}
              onReady={(result) => {
                // Optional: Log when route is ready
                console.log('[GroupJourney] Route ready:', result.distance, result.duration);
              }}
              onError={(errorMessage) => {
                console.warn('[GroupJourney] Directions error:', errorMessage);
              }}
            />
          ) : manualRouteCoords.length > 1 ? (
            <Polyline
              coordinates={manualRouteCoords}
              strokeWidth={4}
              strokeColor="#F9A825"
            />
          ) : null
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
              description={`${convertDistance((member.totalDistance || 0) / 1000)} • ${member.status}`}
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

      {/* Speed Limit Sign */}
      {myLocation && myLocation.latitude && myLocation.longitude && (
        <SpeedLimitSign latitude={myLocation.latitude} longitude={myLocation.longitude} />
      )}

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
              {convertDistance(
                myLocation
                  ? (myLocation.totalDistance || 0) / 1000
                  : 0
              )}
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
                {convertDistance((member.totalDistance || 0) / 1000)}
              </Text>
              {member.status === "COMPLETED" && (
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {!myInstance && !userStartLocation && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => setShowStartLocationModal(true)}
        >
          <Text style={styles.startButtonText}>Set Start Location</Text>
        </TouchableOpacity>
      )}

      {!myInstance && userStartLocation && (
        <TouchableOpacity
          style={[styles.startButton, isStarting && styles.buttonDisabled]}
          onPress={handleStartInstance}
          disabled={isStarting}
        >
          {isStarting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startButtonText}>Start Riding</Text>
          )}
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
            style={[styles.controlButton, styles.pauseButton, isPausing && styles.buttonDisabled]}
            onPress={handleTogglePause}
            disabled={isPausing}
          >
            {isPausing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons
                  name={myInstance.status === "PAUSED" ? "play" : "pause"}
                  size={22}
                  color="#fff"
                />
                <Text style={styles.controlButtonText}>
                  {myInstance.status === "PAUSED" ? "Resume" : "Pause"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, styles.completeButton, isCompleting && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={isCompleting}
          >
            {isCompleting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={22} color="#fff" />
                <Text style={styles.controlButtonText}>Complete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {showStartLocationModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Your Start Location</Text>
            <Text style={styles.modalSubtitle}>Where are you starting from?</Text>
            <LocationPicker
              placeholder="Start Location"
              value={userStartLocation?.address || ''}
              onLocationSelect={(location) => {
                setUserStartLocation({
                  latitude: location.latitude,
                  longitude: location.longitude,
                  address: location.address,
                });
              }}
              currentLocation={region ? { latitude: region.latitude, longitude: region.longitude } : undefined}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowStartLocationModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, (!userStartLocation || isStarting) && styles.modalConfirmDisabled]}
                onPress={() => {
                  if (userStartLocation && !isStarting) {
                    handleStartInstance();
                    setShowStartLocationModal(false);
                  }
                }}
                disabled={!userStartLocation || isStarting}
              >
                {isStarting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  buttonDisabled: {
    opacity: 0.6,
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
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  modalConfirmDisabled: {
    backgroundColor: '#9ca3af',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
