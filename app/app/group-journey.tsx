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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useGroupJourney } from '../hooks/useGroupJourney';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { useJourneyStats } from '../hooks/useJourneyState';
import { getSocket } from '../services/socket';
import { apiRequest, galleryAPI } from '../services/api';
import { fetchDirections, getGoogleMapsApiKey } from '../services/directions';
import JourneyCamera from '../components/JourneyCamera';
import LocationPicker from '../components/LocationPicker';
import { useGroupMapBehavior } from '../components/map/GroupMapBehavior';
import { SpeedLimitSign } from '../components/ui/SpeedLimitSign';
import RideCelebration, { CelebrationEvent } from '../components/RideCelebration';
import { useAppDispatch } from '../store/hooks';
import { clearJourney, setCurrentJourney, setTracking, setJourneyMinimized, setMyInstance as setMyInstanceRedux, setStats, clearRoutePoints } from '../store/slices/journeySlice';
import BackgroundTaskService from '../services/backgroundTaskService';
import LiveNotificationService from '../services/liveNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PhotoChallengeCard from '../components/PhotoChallengeCard';

type MeasurementParts = { value: string; unit: string };

const splitMeasurement = (formatted: string): MeasurementParts => {
  if (!formatted) {
    return { value: '0', unit: '' };
  }
  const match = formatted.match(/^\s*([-+]?\d*[.,]?\d*)\s*(.*)$/);
  if (!match) {
    return { value: formatted, unit: '' };
  }
  return {
    value: match[1] || formatted,
    unit: (match[2] || '').toUpperCase().trim(),
  };
};

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
  const { convertDistance, convertSpeed } = useSettings();
  const reduxDispatch = useAppDispatch();
  const socket = getSocket();
  const googleKey = getGoogleMapsApiKey();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const stats = useJourneyStats();

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
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const {
    memberLocations,
    myInstance,
    isTracking,
    startLocationTracking,
    stopLocationTracking,
    setMyInstance,
  } = useGroupJourney({ socket, groupJourneyId, autoStart: true });

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

  // Listen for admin-ended journey
  useEffect(() => {
    if (!socket || !groupJourneyId) return;
    const handleCompleted = async (data: any) => {
      if (data?.groupJourneyId !== groupJourneyId) return;
      const isAdminEnd = data?.endedByAdmin === true;

      // Stop tracking and clean up all state
      stopLocationTracking();
      BackgroundTaskService.stopBackgroundTracking().catch(() => {});
      reduxDispatch(setMyInstanceRedux(null));
      reduxDispatch(clearJourney());
      reduxDispatch(setTracking(false));
      reduxDispatch(setJourneyMinimized(false));
      reduxDispatch(setStats({
        totalDistance: 0, totalTime: 0, movingTime: 0,
        avgSpeed: 0, topSpeed: 0, currentSpeed: 0,
        activeMembersCount: 0, completedMembersCount: 0,
      }));
      reduxDispatch(clearRoutePoints());
      await AsyncStorage.multiRemove([
        'active_journey_id', 'active_group_instance_id',
        'journey_start_time', 'active_group_journey_id',
      ]).catch(() => {});
      LiveNotificationService.dismissNotification().catch(() => {});

      Alert.alert(
        isAdminEnd ? 'Journey Ended' : t('groupJourney.journeyComplete'),
        isAdminEnd ? 'The admin has ended this group journey.' : t('groupJourney.greatRide'),
        [
          {
            text: 'View Summary',
            onPress: () => {
              // Defer navigation to avoid Android Alert callback timing issues
              setTimeout(() => {
                try {
                  router.replace({
                    pathname: '/group-journey-detail',
                    params: { groupJourneyId },
                  } as any);
                } catch {
                  router.push({
                    pathname: '/group-journey-detail',
                    params: { groupJourneyId },
                  } as any);
                }
              }, 100);
            },
          },
        ]
      );
    };
    socket.on('group-journey:completed', handleCompleted);
    return () => {
      socket.off('group-journey:completed', handleCompleted);
    };
  }, [socket, groupJourneyId, router, t]);

  const [showCamera, setShowCamera] = useState(false);
  const [showStartLocationModal, setShowStartLocationModal] = useState(false);
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null);
  const lastMilestoneRef = useRef(0);
  const [photosTaken, setPhotosTaken] = useState(0);
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
        // Don't send journeyId for group rides — gallery controller validates
        // against the Journey table (solo), not GroupJourney. The photo is
        // linked to the group journey via the RideEvent instead.

        // Include capture stats (speed in km/h, distance in km)
        const currentSpeed = myLocation?.speed || 0;
        const currentDistance = myLocation?.totalDistance || 0; // already in km
        if (currentSpeed > 0) {
          formData.append('speed', String(currentSpeed));
        }
        if (currentDistance > 0) {
          formData.append('distance', String(currentDistance));
        }

        // Use the dedicated gallery API function
        const uploadResponse = await galleryAPI.uploadPhoto(formData);

        if (!uploadResponse?.success) {
          throw new Error('Upload failed');
        }

        const mediaUrl =
          uploadResponse?.photo?.imageUrl ||
          uploadResponse?.photo?.firebasePath ||
          photoData.uri;

        // Create ride event for the photo (with capture stats)
        await apiRequest(`/group-journey/${groupJourneyId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'PHOTO',
            message: t('groupJourney.sharedPhoto'),
            latitude: photoData.latitude,
            longitude: photoData.longitude,
            mediaUrl,
            captureSpeed: currentSpeed || undefined,
            captureDistance: currentDistance || undefined,
          }),
        });

        setPhotosTaken(prev => prev + 1);
        Alert.alert(t('alerts.success'), t('groupJourney.photoShared'));
      } catch (error) {
        console.warn('Failed to upload group photo', error);
        Alert.alert(t('alerts.error'), t('groupJourney.failedToUpload'));
      } finally {
        setShowCamera(false);
      }
    },
    [groupJourneyId, myLocation]
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
          setLocationError(t('groupJourney.locationPermissionDenied'));
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
          setLocationError(t('groupJourney.unableToDetermineLocation'));
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
        throw new Error(t('groupJourney.journeyNotFound'));
      }
      setJourneyData(response.groupJourney);
      const mine = response.groupJourney.instances?.find(
        (inst: any) => inst.userId === user?.id
      );
      if (mine) {
        setMyInstance(mine);
      }
    } catch (error: any) {
      Alert.alert(t('alerts.error'), error?.message || t('groupJourney.failedToLoad'));
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



  const displayedStats = useMemo(() => {
    // If a specific member is selected, show their stats
    if (selectedMemberId && selectedMemberId !== user?.id) {
      const member = memberLocations.find(m => m.userId === selectedMemberId);
      if (member) {
        return {
          distance: member.totalDistance || 0, // already in km from smart tracking
          speed: (member.speed || 0) * 3.6, // m/s from socket → km/h for convertSpeed
          time: member.totalTime || 0,
          isMe: false,
          displayName: member.displayName,
        };
      }
    }

    // Default to my stats from Redux (which has the running timer)
    // stats.totalDistance is in km from useSmartTracking's officialDistance
    return {
      distance: stats.totalDistance || 0,
      speed: stats.currentSpeed || 0,
      time: stats.totalTime || 0,
      isMe: true,
      displayName: t('common.you'),
    };
  }, [selectedMemberId, memberLocations, stats, user?.id, t]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Distance milestone celebrations
  useEffect(() => {
    if (!myLocation?.totalDistance) return;
    const distKm = myLocation.totalDistance || 0; // already in km
    const milestones = [5, 10, 25, 50, 100];
    for (const km of milestones) {
      if (distKm >= km && lastMilestoneRef.current < km) {
        lastMilestoneRef.current = km;
        setCelebrationEvent({
          id: `dist-${km}`,
          title: `${km} km reached!`,
          subtitle: 'Keep riding!',
          xp: km >= 50 ? 50 : 25,
          icon: 'trophy',
        });
        break;
      }
    }
  }, [myLocation?.totalDistance]);

  // Listen for achievement:unlocked socket events
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { achievementId: string; xpAwarded: number }) => {
      setCelebrationEvent({
        id: data.achievementId,
        title: 'Achievement Unlocked!',
        subtitle: data.achievementId.replace(/_/g, ' '),
        xp: data.xpAwarded,
        icon: 'ribbon',
      });
    };
    socket.on('achievement:unlocked', handler);
    return () => { socket.off('achievement:unlocked', handler); };
  }, [socket]);

  // Direction origin: Only show route for current user from their current/start location
  // Stabilized to prevent excessive Directions API calls — only updates when user moves >150m
  const stableDirectionOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const directionOrigin = useMemo(() => {
    // If completed, don't show route
    if (myInstance?.status === "COMPLETED") {
      stableDirectionOriginRef.current = null;
      return undefined;
    }

    // Determine raw origin from best available source
    let raw: { latitude: number; longitude: number } | null = null;

    // Priority 1: User's real-time location from memberLocations (most accurate)
    if (myLocation?.latitude && myLocation?.longitude) {
      raw = { latitude: myLocation.latitude, longitude: myLocation.longitude };
    }
    // Priority 2: User's current location from instance
    else if (myInstance?.currentLatitude && myInstance?.currentLongitude) {
      raw = { latitude: myInstance.currentLatitude, longitude: myInstance.currentLongitude };
    }
    // Priority 3: User's start region (from initial GPS fix)
    else if (userStartRegion) {
      raw = { latitude: userStartRegion.latitude, longitude: userStartRegion.longitude };
    }
    // Priority 4: Instance start location
    else if (myInstance?.startLatitude && myInstance?.startLongitude) {
      raw = { latitude: myInstance.startLatitude, longitude: myInstance.startLongitude };
    }

    if (!raw) return undefined;

    // Stabilize: only update if moved >150m from last stable origin
    const prev = stableDirectionOriginRef.current;
    if (prev) {
      const R = 6371000;
      const dLat = ((raw.latitude - prev.latitude) * Math.PI) / 180;
      const dLon = ((raw.longitude - prev.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prev.latitude * Math.PI) / 180) *
          Math.cos((raw.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      if (dist < 150) return prev; // Not moved enough, keep stable reference
    }

    stableDirectionOriginRef.current = raw;
    return raw;
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
  ]);


  // Fetch directions for iOS or when Google Maps API is not available
  // Android uses MapViewDirections which automatically updates when origin changes
  const lastDirectionsOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const directionsThrottleRef = useRef<number>(0);

  useEffect(() => {
    if (!destination || !directionOrigin) {
      setManualRouteCoords([]);
      return;
    }

    // Only fetch manual directions when MapViewDirections is NOT rendered
    // MapViewDirections is used on all platforms when googleKey exists
    if (googleKey) {
      setManualRouteCoords([]);
      return;
    }

    // Throttle: skip if less than 10s since last fetch
    const now = Date.now();
    if (now - directionsThrottleRef.current < 10000) return;

    // Distance gate: skip if user hasn't moved >100m since last fetch
    const lastOrig = lastDirectionsOriginRef.current;
    if (lastOrig) {
      const R = 6371000;
      const dLat = ((directionOrigin.latitude - lastOrig.latitude) * Math.PI) / 180;
      const dLon = ((directionOrigin.longitude - lastOrig.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lastOrig.latitude * Math.PI) / 180) *
          Math.cos((directionOrigin.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      if (dist < 100) return;
    }

    directionsThrottleRef.current = now;
    lastDirectionsOriginRef.current = directionOrigin;

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

  // Animate map to target region — throttle to avoid rapid camera changes
  const lastMapAnimateRef = useRef<number>(0);
  useEffect(() => {
    if (!targetRegion) return;
    const now = Date.now();
    if (now - lastMapAnimateRef.current < 3000) return; // Max once per 3s
    lastMapAnimateRef.current = now;
    setRegion(targetRegion);
    mapRef.current?.animateToRegion(targetRegion, 800);
  }, [targetRegion]);



  useEffect(() => {
    if (myInstance?.status === "ACTIVE" && !isTracking && myInstance.id) {
      startLocationTracking(myInstance.id);
      // On iOS, enable useSmartTracking for Roads API distance calculation.
      // On Android, skip this — dual GPS watchers (useSmartTracking + useGroupJourney)
      // conflict via Fused Location Provider, causing neither to get reliable updates.
      // useGroupJourney has its own Haversine fallback for distance on Android.
      if (Platform.OS === 'ios') {
        reduxDispatch(setTracking(true));
      }
    }
  }, [isTracking, myInstance, startLocationTracking, reduxDispatch]);

  const [isStarting, setIsStarting] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleStartInstance = async () => {
    if (!groupJourneyId || !userStartLocation) {
      Alert.alert(t('alerts.error'), t('groupJourney.selectStartLocation'));
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
      const instance = response.instance;
      setMyInstance(instance);

      // Set up Redux journey state so useSmartTracking starts calculating distance
      reduxDispatch(setMyInstanceRedux(instance));
      reduxDispatch(setCurrentJourney({
        id: instance.id,
        title: journeyData?.title || 'Group Ride',
        startLocation: {
          latitude: userStartLocation.latitude,
          longitude: userStartLocation.longitude,
          address: userStartLocation.address || 'Start Location',
        },
        endLocation: journeyData?.endLatitude && journeyData?.endLongitude ? {
          latitude: journeyData.endLatitude,
          longitude: journeyData.endLongitude,
          address: 'Destination',
        } : undefined,
        groupId: journeyData?.groupId,
        groupJourneyId,
        vehicle: instance.vehicle || 'car',
        status: 'active',
        photos: [],
      }));
      // On iOS, enable useSmartTracking for Roads API distance.
      // On Android, skip to avoid dual GPS watcher conflict.
      if (Platform.OS === 'ios') {
        reduxDispatch(setTracking(true));
      }
      reduxDispatch(setJourneyMinimized(true));

      startLocationTracking(instance.id);
      setShowStartLocationModal(false);

      // Start background tracking (non-blocking)
      BackgroundTaskService.startBackgroundTracking(instance.id, {
        startLocationName: userStartLocation.address || 'Start',
        destinationName: journeyData?.endLatitude ? 'Destination' : undefined,
        destinationLatitude: journeyData?.endLatitude,
        destinationLongitude: journeyData?.endLongitude,
        startTime: Date.now(),
      }).catch(err => console.warn('[GroupJourney] Background tracking init failed:', err));
    } catch (error: any) {
      console.error('Start instance error:', error);
      const errorMessage = error?.response?.data?.message || error?.message || t('groupJourney.tryAgain');
      Alert.alert(
        t('groupJourney.unableToStart'),
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
        body: {},
      });
      if (endpoint === "resume") {
        startLocationTracking(myInstance.id);
        setMyInstance((prev) => (prev ? { ...prev, status: "ACTIVE" } : prev));
      } else {
        stopLocationTracking();
        setMyInstance((prev) => (prev ? { ...prev, status: "PAUSED" } : prev));
      }
    } catch (error: any) {
      Alert.alert(t('alerts.error'), error?.message || t('groupJourney.unableToToggle'));
    } finally {
      setIsPausing(false);
    }
  };

  const handleComplete = () => {
    if (!myInstance) return;
    Alert.alert(
      t('groupJourney.completeRide'),
      t('groupJourney.completeConfirm'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('groupJourney.complete'),
          style: "destructive",
            onPress: async () => {
            setIsCompleting(true);
            try {
              // Stop location tracking first
              stopLocationTracking();
              BackgroundTaskService.stopBackgroundTracking().catch(() => {});
              
              // Get current location for end coordinates
              const currentLocation = myLocation || (region ? { latitude: region.latitude, longitude: region.longitude } : null);
              
              // Get final stats from background service as fallback (Android accuracy fix)
              let finalDistance = stats.totalDistance || 0;
              try {
                const bgState = await BackgroundTaskService.getPersistedJourneyState();
                if (bgState?.totalDistance && bgState.totalDistance > finalDistance) {
                  finalDistance = bgState.totalDistance;
                }
              } catch {}

              // Prepare request body with final stats (include speed stats for summary)
              const requestBody: { endLatitude?: number; endLongitude?: number; totalDistance?: number; totalTime?: number; avgSpeed?: number; topSpeed?: number } = {
                totalDistance: finalDistance,
                totalTime: stats.totalTime || 0,
                avgSpeed: stats.avgSpeed || 0,
                topSpeed: stats.topSpeed || 0,
              };
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
                throw new Error(response?.error || response?.message || t('groupJourney.failedToComplete'));
              }
              
              // Clear all journey state for fresh start
              setMyInstance(null);
              setJourneyData(null);
              setRegion(null);
              setManualRouteCoords([]);

              // Clear Redux journey state so floating pill and timer stop
              reduxDispatch(setMyInstanceRedux(null));
              reduxDispatch(clearJourney());
              reduxDispatch(setTracking(false));
              reduxDispatch(setJourneyMinimized(false));
              reduxDispatch(setStats({
                totalDistance: 0, totalTime: 0, movingTime: 0,
                avgSpeed: 0, topSpeed: 0, currentSpeed: 0,
                activeMembersCount: 0, completedMembersCount: 0,
              }));
              reduxDispatch(clearRoutePoints());

              // Clear persisted journey IDs
              await AsyncStorage.multiRemove([
                'active_journey_id', 'active_group_instance_id',
                'journey_start_time', 'active_group_journey_id',
              ]).catch(() => {});

              // Dismiss Live Activity / notification
              try {
                await LiveNotificationService.dismissNotification();
              } catch (e) {
                console.warn('[GroupJourney] Failed to dismiss notification:', e);
              }

              Alert.alert(
                t('groupJourney.journeyComplete'),
                t('groupJourney.greatRide'),
                [
                  {
                    text: 'View Summary',
                    onPress: () => {
                      // Defer navigation to avoid Android Alert callback timing issues
                      setTimeout(() => {
                        try {
                          router.replace({
                            pathname: '/group-journey-detail',
                            params: { groupJourneyId: groupJourneyId || '' },
                          } as any);
                        } catch {
                          router.push({
                            pathname: '/group-journey-detail',
                            params: { groupJourneyId: groupJourneyId || '' },
                          } as any);
                        }
                      }, 100);
                    },
                  },
                ]
              );
            } catch (error: any) {
              console.error('[GroupJourney] Complete error:', error);
              const errorMessage = error?.response?.data?.message || 
                                 error?.response?.data?.error || 
                                 error?.message || 
                                 t('groupJourney.failedToComplete'); // Reuse failedToComplete or create separate message
              Alert.alert(t('alerts.error'), errorMessage);
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
        <Text style={styles.errorText}>{t('groupJourney.missingId')}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F9A825" />
        <Text style={styles.loadingText}>{t('groupJourney.loading')}</Text>
      </View>
    );
  }

  if (!journeyData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{t('groupJourney.journeyNotFound')}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F9A825" />
        <Text style={styles.loadingText}>
          {isLocatingUser
            ? t('groupJourney.gettingLocation')
            : locationError || t('groupJourney.preparingMap')}
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
      <Stack.Screen options={{ title: journeyData.title, headerShown: false }} />
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        region={region}
        initialRegion={region}
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
          googleKey ? (
            <MapViewDirections
              key={`directions-${destination.latitude}-${destination.longitude}`}
              origin={directionOrigin}
              destination={destination}
              apikey={googleKey}
              strokeWidth={4}
              strokeColor="#F9A825"
              mode="DRIVING"
              optimizeWaypoints={true}
              resetOnChange={false}
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

        {typeof journeyData.startLatitude === 'number' && typeof journeyData.startLongitude === 'number' &&
         journeyData.startLatitude !== 0 && journeyData.startLongitude !== 0 && (
          <Marker
            coordinate={{
              latitude: journeyData.startLatitude,
              longitude: journeyData.startLongitude,
            }}
            title="Start"
            pinColor="green"
          />
        )}

        {journeyData.endLatitude && journeyData.endLongitude && (
          <Marker
            coordinate={{
              latitude: journeyData.endLatitude,
              longitude: journeyData.endLongitude,
            }}
            title={t('groupJourney.destination')}
            pinColor="red"
          />
        )}

        {memberLocations.map((member) => {
          if (
            typeof member.latitude !== "number" ||
            typeof member.longitude !== "number" ||
            isNaN(member.latitude) ||
            isNaN(member.longitude)
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
              description={`${convertDistance(member.totalDistance || 0)} • ${member.status}`}
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

      {/* Ride Celebration Toast */}
      <RideCelebration
        event={celebrationEvent}
        onDismiss={() => setCelebrationEvent(null)}
      />

      {/* Floating Camera Button - Above Bottom Panel */}
      {myInstance && myInstance.status !== 'COMPLETED' && (
        <TouchableOpacity
          style={styles.floatingCameraButton}
          onPress={() => setShowCamera(true)}
        >
          <MaterialIcons name="camera-alt" size={24} color="#000" />
        </TouchableOpacity>
      )}

      {/* Bottom Panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 12 }]}>
        {/* Friends Row - Horizontal Scroll */}
        <View style={styles.friendsRow}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.friendsContainer}
          >
            {/* Always show ME first */}
            <TouchableOpacity 
              onPress={() => setSelectedMemberId(null)} 
              style={[styles.friendAvatarContainer, !selectedMemberId && styles.selectedAvatar]}
            >
              <Image 
                source={user?.photoURL ? { uri: user.photoURL } : require("../assets/images/2025-09-26/byc45z4XPi.png")} 
                style={styles.friendAvatar} 
              />
              <Text style={styles.friendName} numberOfLines={1}>{t('common.you')}</Text>
              {myInstance?.status === 'COMPLETED' && (
                <View style={styles.avatarStatusBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                </View>
              )}
            </TouchableOpacity>
             
            {/* Other Members */}
            {memberLocations.filter(m => m.userId !== user?.id).map(member => (
              <TouchableOpacity 
                key={member.userId} 
                onPress={() => setSelectedMemberId(selectedMemberId === member.userId ? null : member.userId)} 
                style={[styles.friendAvatarContainer, selectedMemberId === member.userId && styles.selectedAvatar]}
              >
                 <Image 
                    source={member.photoURL ? { uri: member.photoURL } : require("../assets/images/2025-09-26/byc45z4XPi.png")} 
                    style={[styles.friendAvatar, selectedMemberId === member.userId && styles.selectedFriendAvatar]} 
                 />
                 <Text style={styles.friendName} numberOfLines={1}>{member.displayName?.split(' ')[0]}</Text>
                 {member.status === 'COMPLETED' && (
                    <View style={styles.avatarStatusBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                    </View>
                 )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {/* Time */}
          <View style={styles.statItem}>
             <Text style={styles.statValue}>{formatTime(displayedStats.time)}</Text>
             <Text style={styles.statLabel}>{t('journey.time')}</Text>
          </View>
          
          {/* Speed */}
          <View style={styles.statItem}>
             <View style={styles.speedContainer}>
                <Text style={styles.statValue}>{splitMeasurement(convertSpeed(displayedStats.speed)).value}</Text>
                <Text style={styles.speedUnit}>{splitMeasurement(convertSpeed(displayedStats.speed)).unit}</Text>
             </View>
             <Text style={styles.statLabel}>{t('journey.speed')}</Text>
          </View>
          
          {/* Distance */}
          <View style={styles.statItem}>
             <View style={styles.distanceContainer}>
                <Text style={styles.statValue}>{splitMeasurement(convertDistance(displayedStats.distance)).value}</Text>
                <Text style={styles.distanceUnit}>{splitMeasurement(convertDistance(displayedStats.distance)).unit}</Text>
             </View>
             <Text style={styles.statLabel}>{t('journey.distance')}</Text>
          </View>
        </View>

        {/* Action Buttons Row */}
        {myInstance && myInstance.status !== 'COMPLETED' && (
          <View style={styles.actionButtonsRow}>
             <TouchableOpacity 
                style={[styles.actionButton, styles.pauseButton]} 
                onPress={handleTogglePause} 
                disabled={isPausing}
             >
                {isPausing ? (
                    <ActivityIndicator color="#000" />
                ) : (
                    <MaterialIcons name={myInstance.status === 'PAUSED' ? "play-arrow" : "pause"} size={28} color="#000" />
                )}
             </TouchableOpacity>
             
             <TouchableOpacity 
                style={[styles.actionButton, styles.completeButton]} 
                onPress={handleComplete} 
                disabled={isCompleting}
             >
                {isCompleting ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.completeButtonText}>{t('common.complete')}</Text>
                )}
             </TouchableOpacity>
          </View>
        )}
       
        {/* Start Button if not started */}
        {!myInstance && !userStartLocation && (
          <View style={styles.startJourneyContainer}>
             <TouchableOpacity 
                style={styles.startJourneyButton} 
                onPress={() => setShowStartLocationModal(true)}
             >
                <Text style={styles.startJourneyText}>{t('groupJourney.setStartLocation')}</Text>
             </TouchableOpacity>
          </View>
        )}

        {!myInstance && userStartLocation && (
          <View style={styles.startJourneyContainer}>
             <TouchableOpacity 
                style={[styles.startJourneyButton, isStarting && styles.buttonDisabled]} 
                onPress={handleStartInstance} 
                disabled={isStarting}
             >
                {isStarting ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.startJourneyText}>{t('groupJourney.startRiding')}</Text>
                )}
             </TouchableOpacity>
          </View>
        )}
      </View>

      {showStartLocationModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('group.setYourStartLocation')}</Text>
            <Text style={styles.modalSubtitle}>{t('group.whereStartingFrom')}</Text>
            <LocationPicker
              placeholder={t('group.startLocation')}
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
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
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
                  <Text style={styles.modalConfirmText}>{t('common.confirm')}</Text>
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
  
  // Floating Camera Button - positioned above bottom panel
  floatingCameraButton: {
    position: 'absolute',
    right: 16,
    bottom: 240, // Adjust based on bottom panel height
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 20,
    zIndex: 20,
  },

  // Bottom Panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 16,
  },
  
  // Friends Row
  friendsRow: {
    marginBottom: 20,
  },
  friendsContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  friendAvatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  selectedAvatar: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  friendAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#F3F4F6', // Default border
  },
  selectedFriendAvatar: {
    borderColor: '#F9A825', // Theme orange
    borderWidth: 3,
  },
  friendName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  avatarStatusBadge: {
    position: 'absolute',
    top: 0,
    right: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  speedUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginLeft: 2,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distanceUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginLeft: 2,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: '#F3F4F6',
    flex: 0.3, // Smaller width for pause button
  },
  completeButton: {
    backgroundColor: '#F9A825', // Theme orange
    flex: 0.7,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Start Journey Button
  startJourneyContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  startJourneyButton: {
    backgroundColor: '#F9A825', // Theme orange
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F9A825',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  startJourneyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // Modals (Keeping existing modal styles)
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    zIndex: 50,
    elevation: 50,
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
    zIndex: 50,
    elevation: 50,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    overflow: 'visible',
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
  
  // Existing Marker styles
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
    backgroundColor: '#fff',
    borderRadius: 9,
  },
  
  // Challenge Card (if still used)
  challengeCardContainer: {
    position: 'absolute',
    bottom: 240, // Move up to accommodate bottom panel
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
  },
});
