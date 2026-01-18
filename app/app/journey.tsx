import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useJourney } from '../contexts/JourneyContext';
import { useAuth } from '../contexts/AuthContext';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../services/api';
import { fetchDirections, getGoogleMapsApiKey } from '../services/directions';
import RideTimeline from '../components/RideTimeline';
import TrackingOverlay from '../components/TrackingOverlay';
import MessageComposer from '../components/MessageComposer';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { useGroupJourney } from '../hooks/useGroupJourney';
import { getSocket } from '../services/socket';
import { useJourneyState, useJourneyMembers, useJourneyStats } from '../hooks/useJourneyState';
import { useSettings } from '../contexts/SettingsContext';
import { SpeedLimitSign } from '../components/ui/SpeedLimitSign';

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

const normalizeDistanceValue = (value?: number | null): number => {
  if (!value) return 0;
  return value > 500 ? value / 1000 : value;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function JourneyScreen(): React.JSX.Element {
  const { groupId: paramGroupId, groupJourneyId } = useLocalSearchParams<{ groupId?: string; groupJourneyId?: string }>();
  const {
    routePoints,
    startJourney,
    resumeJourney,
    endJourney,
    clearStuckJourney,
    addPhoto,
    minimizeJourney,
    loadGroupMembers,
    currentLocation,
  } = useJourney();
  const { t } = useTranslation();
  const { currentJourney, isTracking, isMinimized } = useJourneyState();
  const stats = useJourneyStats();
  const groupMembers = useJourneyMembers();
  const { convertDistance, convertSpeed } = useSettings();

  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [manualRouteCoords, setManualRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const lastOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [groupView, setGroupView] = useState<{ start?: { latitude: number; longitude: number }; end?: { latitude: number; longitude: number } } | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [isStartBusy, setIsStartBusy] = useState(false);
  const startIconAnimation = useRef(new Animated.Value(0)).current;

  // Real-time events for group journeys
  const gJourneyId = typeof groupJourneyId === 'string' ? groupJourneyId : undefined;
  const { events, postEvent } = useRealtimeEvents({ groupJourneyId: gJourneyId });

  // Group journey real-time coordination
  const socket = getSocket();
  const {
    memberLocations,
    isTracking: isGroupTracking,
    startLocationTracking,
    stopLocationTracking,
    setMyInstance,
    myInstance,
  } = useGroupJourney({
    socket,
    groupJourneyId: gJourneyId,
    autoStart: true, // Auto-join the socket room when component mounts
  });

  // Debug: Log member locations when they change
  useEffect(() => {
    if (memberLocations.length > 0) {
      console.log('👥 Member locations updated:', memberLocations.length, 'members');
    }
  }, [memberLocations]);

  const { user } = useAuth();

  // Resolve Google Maps API key (single source of truth)
  const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(startIconAnimation, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(startIconAnimation, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [startIconAnimation]);

  // If navigated with a groupId param, load group members overlay
  useEffect(() => {
    const gid = typeof paramGroupId === 'string' ? paramGroupId : undefined;
    if (!gid) return;
    // Load once when arriving with param
    loadGroupMembers(gid).catch(() => {});
  }, [paramGroupId, loadGroupMembers]);

  // Initialize map with current location if no region set
  useEffect(() => {
    if (!region && !currentJourney?.startLocation && !groupView?.start) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            // Try cache first for speed
            const lastKnown = await Location.getLastKnownPositionAsync();
            if (lastKnown) {
               const cachedRegion = {
                latitude: lastKnown.coords.latitude,
                longitude: lastKnown.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              };
              setRegion(cachedRegion);
              if (mapRef.current) {
                try { mapRef.current.animateToRegion(cachedRegion, 800); } catch {}
              }
            }

            // Then fetch fresh location
            const location = await Location.getCurrentPositionAsync({});
            const newRegion = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            };
            setRegion(newRegion);
            if (mapRef.current) {
              try { mapRef.current.animateToRegion(newRegion, 800); } catch {}
            }
          }
        } catch (e) {
          console.warn('Failed to get current location for map:', e);
        }
      })();
    }
  }, [region, currentJourney?.startLocation, groupView?.start]);

  // If a groupJourneyId param is present, fetch group journey data and user's instance
  useEffect(() => {
    (async () => {
      if (!groupJourneyId || typeof groupJourneyId !== 'string') return;
      try {
        // Fetch group journey details
        const res = await apiRequest(`/group-journey/${groupJourneyId}`, { method: 'GET' });
        if (res?.groupJourney) {
          const gj = res.groupJourney;
          const start = gj.startLatitude && gj.startLongitude ? { latitude: gj.startLatitude, longitude: gj.startLongitude } : undefined;
          const end = gj.endLatitude && gj.endLongitude ? { latitude: gj.endLatitude, longitude: gj.endLongitude } : undefined;
          setGroupView({ start, end });
          if (start && mapRef.current) {
            const newRegion = { latitude: start.latitude, longitude: start.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
            setRegion(newRegion);
            try { mapRef.current.animateToRegion(newRegion, 800); } catch {}
          }
        }

        // Fetch user's journey instance for this group journey
        const instanceRes = await apiRequest(`/group-journey/${groupJourneyId}/my-instance`, { method: 'GET' });
        if (instanceRes?.instance) {
          const instance = instanceRes.instance;
          setMyInstance(instance); // Update the hook's instance state
          console.log(' Loaded my group journey instance:', instance);
          
          // If instance is ACTIVE, start location tracking immediately
          if (instance.status === 'ACTIVE' && !isGroupTracking) {
            console.log('🚴 Instance is ACTIVE, starting location tracking...');
            startLocationTracking(instance.id);
          }
        }
      } catch (e) {
        console.warn('Failed to load group journey data:', e);
      }
    })();
  }, [groupJourneyId, setMyInstance, isGroupTracking, startLocationTracking]);

  const handleSendMessage = (message: string) => {
    postEvent({ type: 'MESSAGE', message });
  };

  const needsDestinationPrompt = useMemo(() => {
    const isGroupRide = Boolean(gJourneyId || currentJourney?.groupId);
    const hasDestination = Boolean(currentJourney?.endLocation || groupView?.end);
    return isGroupRide && !hasDestination;
  }, [gJourneyId, currentJourney?.endLocation, currentJourney?.groupId, groupView]);

  const speedMeasurement = useMemo(() => {
    const value = isTracking && stats ? stats.currentSpeed : 0;
    return splitMeasurement(convertSpeed(value));
  }, [convertSpeed, isTracking, stats]);

  const distanceMeasurement = useMemo(() => {
    const value = isTracking && stats ? stats.totalDistance : 0;
    return splitMeasurement(convertDistance(value));
  }, [convertDistance, isTracking, stats]);

  const bikeTranslation = startIconAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 6],
  });

  const handleDestinationPrompt = () => {
    const targetGroupId = typeof paramGroupId === 'string' ? paramGroupId : currentJourney?.groupId;
    if (targetGroupId) {
      router.push(`/group-detail?groupId=${targetGroupId}`);
      return;
    }
    if (targetGroupId) {
      router.push(`/group-detail?groupId=${targetGroupId}`);
      return;
    }
    Alert.alert(t('alerts.destinationNeeded'), t('alerts.pickDestinationFirst'));
  };

  // Update map region when journey starts or route changes
  useEffect(() => {
    if (currentJourney?.startLocation && mapRef.current) {
      const newRegion = {
        latitude: currentJourney.startLocation.latitude,
        longitude: currentJourney.startLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(newRegion);
      mapRef.current.animateToRegion(newRegion, 1000);
    }
  }, [currentJourney?.startLocation]);

  // Fit breadcrumb when active and no destination set
  useEffect(() => {
    if (!currentJourney?.endLocation && routePoints.length > 1 && mapRef.current) {
      mapRef.current.fitToCoordinates(routePoints, {
        edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }
  }, [routePoints, currentJourney?.endLocation]);

  const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
    const R = 6371000; // meters
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // Live recalc of directions polyline for iOS or fallback rendering
  useEffect(() => {
    const dest = currentJourney?.endLocation;
    if (!dest) return;
    if (routePoints.length === 0) return;

    const current = routePoints[routePoints.length - 1];
    const currentLL = { latitude: current.latitude, longitude: current.longitude };
    const lastOrigin = lastOriginRef.current;

    const shouldRecalc = !lastOrigin || haversine(lastOrigin, currentLL) > 30; // recalc if moved > 30m
    if (!shouldRecalc) return;

    // Only fetch manually on iOS or when we want manual control; Android prefers MapViewDirections
    const doManual = Platform.OS === 'ios' || !GOOGLE_MAPS_API_KEY;
    if (!doManual) {
      lastOriginRef.current = currentLL;
      return; // MapViewDirections will handle updates
    }

    (async () => {
      const result = await fetchDirections(currentLL, { latitude: dest.latitude, longitude: dest.longitude }, {
        mode: 'driving',
        apiKey: GOOGLE_MAPS_API_KEY,
      });
      if (result?.coordinates?.length) {
        setManualRouteCoords(result.coordinates);
        lastOriginRef.current = currentLL;
        try {
          mapRef.current?.fitToCoordinates(result.coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
            animated: true,
          });
        } catch {}
      }
    })();
  }, [routePoints, currentJourney?.endLocation, GOOGLE_MAPS_API_KEY]);

  const handleStartJourney = async () => {
    if (isStartBusy) {
      return;
    }

    if (isTracking) {
      await handleStopJourney();
      return;
    }

    if (needsDestinationPrompt) {
      Alert.alert(
        t('alerts.destinationNeeded'),
        t('alerts.pickDestinationFirst'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('alerts.setDestination'), onPress: handleDestinationPrompt },
        ]
      );
      return;
    }

    if (currentJourney?.status === 'paused' || myInstance?.status === 'PAUSED') {
      setIsStartBusy(true);
      try {
        await handleResumeIfPaused();
      } finally {
        setIsStartBusy(false);
      }
      return;
    }

    setIsStartBusy(true);
    try {
      const success = await startJourney({
        title: t('journey.defaultTitle') || 'My Journey',
        vehicle: 'car',
        groupId: currentJourney?.groupId,
      });
      if (!success) {
        Alert.alert(t('alerts.error'), t('alerts.startJourneyError'));
      }
    } finally {
      setIsStartBusy(false);
    }
  };

  const handleMinimize = () => {
    minimizeJourney();
    try {
      router.replace('/(tabs)/map');
    } catch {
      router.push('/(tabs)/map');
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request permissions first
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.photoPermission'), t('alerts.cameraNeeded'));
        return;
      }

      // Small delay to ensure ActivityResultLauncher is registered (Android fix)
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        exif: false,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
        await addPhoto(result.assets[0].uri);
      } else if (result.canceled) {
        // User canceled, no error needed
        return;
      } else {
        throw new Error(t('alerts.noPhotoCaptured'));
      }
    } catch (err: any) {
      console.error('Error taking photo:', err);
      // Handle ActivityResultLauncher error specifically
      if (err?.message?.includes('ActivityResultLauncher') || err?.message?.includes('unregistered')) {
        Alert.alert(t('alerts.cameraError'), t('alerts.takePhotoAgain'));
      } else {
        const errorMessage = err instanceof Error ? err.message : t('alerts.uploadFailed');
        Alert.alert(t('alerts.error'), errorMessage === t('alerts.noPhotoCaptured') ? t('alerts.takePhotoAgain') : errorMessage);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleResumeIfPaused = async () => {
    try {
      // If this is a group journey context with a paused instance, resume it server-side and start tracking
      if (gJourneyId && myInstance?.id && myInstance.status === 'PAUSED') {
        await apiRequest(`/group-journey/instance/${myInstance.id}/resume`, { method: 'POST' });
        startLocationTracking(myInstance.id);
        return;
      }
      // Otherwise, fallback to solo journey resume via context
      if (currentJourney?.status === 'paused') {
        await resumeJourney();
      } else {
        Alert.alert(t('common.resume'), t('alerts.resumeMsg'));
      }
    } catch (e) {
      console.warn('Failed to resume journey:', e);
      Alert.alert(t('alerts.error'), t('alerts.resumeError') || 'Failed to resume. Please try again.');
    }
  };

  const handlePauseJourney = async () => {
    try {
      await apiRequest(`/journey/${currentJourney?.id}/pause`, { method: 'POST' });
    } catch (e) {
      console.warn('Pause error', e);
    }
  };

  const handleStopJourney = async () => {
    try {
      // Group journey instance complete
      if (gJourneyId && myInstance?.id && (myInstance.status === 'ACTIVE' || myInstance.status === 'PAUSED')) {
        Alert.alert(
          t('alerts.stopJourneyConfirm'),
          t('alerts.stopGroupConfirm'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.stop'), style: 'destructive', onPress: async () => {
              try {
                // Stop location tracking first
                stopLocationTracking();
                
                // Get current location for end coordinates
                const currentLocationForEnd = currentLocation || (region ? { latitude: region.latitude, longitude: region.longitude } : null);
                
                // Prepare request body - only include coordinates if they're valid numbers
                const requestBody: { endLatitude?: number; endLongitude?: number } = {};
                if (currentLocationForEnd?.latitude != null && typeof currentLocationForEnd.latitude === 'number' && !isNaN(currentLocationForEnd.latitude)) {
                  requestBody.endLatitude = currentLocationForEnd.latitude;
                }
                if (currentLocationForEnd?.longitude != null && typeof currentLocationForEnd.longitude === 'number' && !isNaN(currentLocationForEnd.longitude)) {
                  requestBody.endLongitude = currentLocationForEnd.longitude;
                }
                
                // Call complete endpoint with end coordinates
                const response = await apiRequest(
                  `/group-journey/instance/${myInstance.id}/complete`,
                  {
                    method: 'POST',
                    body: requestBody,
                  }
                );
                
                // Validate response
                if (!response || !response.success) {
                  throw new Error(response?.error || response?.message || 'Failed to complete journey');
                }
                
                // Clear instance state
                setMyInstance(null);
                
                // Navigate away after stopping
                try { router.replace('/(tabs)/map'); } catch { router.push('/(tabs)/map'); }
              } catch (error: any) {
                console.error('[Journey] Complete group journey error:', error);
                const errorMessage = error?.response?.data?.message || 
                                   error?.response?.data?.error || 
                                   error?.message || 
                                   t('alerts.failedStopGroup');
                Alert.alert(t('alerts.error'), errorMessage);
              }
            }}
          ]
        );
        return;
      }

      // Solo journey complete
      if (isTracking || currentJourney?.status === 'paused') {
        Alert.alert(
          t('alerts.stopJourneyConfirm'),
          t('alerts.stopSoloConfirm'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.stop'), style: 'destructive', onPress: async () => {
              await endJourney();
              try { router.replace('/(tabs)/map'); } catch { router.push('/(tabs)/map'); }
            }}
          ]
        );
        return;
      }

      Alert.alert(t('alerts.stopJourneyConfirm'), t('alerts.noActiveStop'));
    } catch {
      Alert.alert(t('alerts.error'), t('alerts.failedStop'));
    }
  };

  const handleClearStuckJourney = () => {
    Alert.alert(
      t('alerts.clearStuckJourneyTitle'),
      t('alerts.clearStuckJourneyMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('alerts.clear'),
          style: 'destructive',
          onPress: async () => {
            try {
              await clearStuckJourney();
              Alert.alert(t('alerts.success'), t('alerts.journeyCleared'));
              router.back();
            } catch {
              Alert.alert(t('alerts.error'), t('alerts.failedToClear'));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {isMinimized ? (
        <>
          <MapView
            ref={mapRef}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            style={styles.backgroundMap}
            region={region || undefined}
            showsUserLocation
            showsMyLocationButton={false}
            showsTraffic={false}
            showsBuildings
            showsIndoors={false}
          >
            {(currentJourney?.endLocation || groupView?.end) &&
            GOOGLE_MAPS_API_KEY ? (
              <MapViewDirections
                origin={
                  routePoints.length > 0
                    ? {
                        latitude: routePoints[routePoints.length - 1].latitude,
                        longitude:
                          routePoints[routePoints.length - 1].longitude,
                      }
                    : currentJourney?.startLocation
                    ? {
                        latitude: currentJourney.startLocation.latitude,
                        longitude: currentJourney.startLocation.longitude,
                      }
                    : groupView?.start
                    ? {
                        latitude: groupView.start.latitude,
                        longitude: groupView.start.longitude,
                      }
                    : region ? { latitude: region.latitude, longitude: region.longitude } : undefined
                }
                destination={
                  currentJourney?.endLocation
                    ? {
                        latitude: currentJourney.endLocation.latitude,
                        longitude: currentJourney.endLocation.longitude,
                      }
                    : groupView?.end
                    ? {
                        latitude: groupView.end.latitude,
                        longitude: groupView.end.longitude,
                      }
                    : (undefined as any)
                }
                apikey={GOOGLE_MAPS_API_KEY}
                mode="DRIVING"
                strokeWidth={5}
                strokeColor="#F9A825"
                optimizeWaypoints
                onError={(err) => console.warn("Directions error:", err)}
              />
            ) : (currentJourney?.endLocation || groupView?.end) &&
              manualRouteCoords.length > 1 ? (
              <Polyline
                coordinates={manualRouteCoords}
                strokeWidth={5}
                strokeColor="#F9A825"
              />
            ) : routePoints.length > 1 ? (
              <Polyline
                coordinates={routePoints}
                strokeWidth={4}
                strokeColor="#F9A825"
              />
            ) : null}
          </MapView>
        </>
      ) : (
        <>
          <MapView
            ref={mapRef}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            style={styles.backgroundMap}
            region={region || undefined}
            showsUserLocation
            showsMyLocationButton={false}
            showsTraffic={false}
            showsBuildings
            showsIndoors={false}
          >
            {currentJourney?.endLocation &&
            GOOGLE_MAPS_API_KEY ? (
              <MapViewDirections
                origin={
                  routePoints.length > 0
                    ? {
                        latitude: routePoints[routePoints.length - 1].latitude,
                        longitude:
                          routePoints[routePoints.length - 1].longitude,
                      }
                    : currentJourney?.startLocation
                    ? {
                        latitude: currentJourney.startLocation.latitude,
                        longitude: currentJourney.startLocation.longitude,
                      }
                    : region ? { latitude: region.latitude, longitude: region.longitude } : undefined
                }
                destination={{
                  latitude: currentJourney.endLocation.latitude,
                  longitude: currentJourney.endLocation.longitude,
                }}
                apikey={GOOGLE_MAPS_API_KEY}
                mode="DRIVING"
                strokeWidth={5}
                strokeColor="#F9A825"
                optimizeWaypoints
                onReady={(result) => {
                  try {
                    mapRef.current?.fitToCoordinates(result.coordinates, {
                      edgePadding: {
                        top: 100,
                        right: 50,
                        bottom: 300,
                        left: 50,
                      },
                      animated: true,
                    });
                  } catch {}
                }}
                onError={(err) => console.warn("Directions error:", err)}
              />
            ) : currentJourney?.endLocation && manualRouteCoords.length > 1 ? (
              <Polyline
                coordinates={manualRouteCoords}
                strokeWidth={5}
                strokeColor="#F9A825"
              />
            ) : !currentJourney?.endLocation && routePoints.length > 1 ? (
              <Polyline
                coordinates={routePoints}
                strokeWidth={4}
                strokeColor="#F9A825"
              />
            ) : null}

            {(currentJourney?.startLocation || groupView?.start) && (
              <Marker
                coordinate={{
                  latitude:
                    currentJourney?.startLocation?.latitude ??
                    groupView!.start!.latitude,
                  longitude:
                    currentJourney?.startLocation?.longitude ??
                    groupView!.start!.longitude,
                }}
                title={t('group.startLocation')}
                pinColor="green"
              />
            )}

            {(currentJourney?.endLocation || groupView?.end) && (
              <Marker
                coordinate={{
                  latitude:
                    currentJourney?.endLocation?.latitude ??
                    groupView!.end!.latitude,
                  longitude:
                    currentJourney?.endLocation?.longitude ??
                    groupView!.end!.longitude,
                }}
                title={t('group.destination')}
                pinColor="red"
              />
            )}

            {/* Show member locations for group journeys */}
            {gJourneyId &&
              memberLocations.map(
                (member) =>
                  member.latitude &&
                  member.longitude && (
                    <Marker
                      key={member.userId}
                      coordinate={{
                        latitude: member.latitude,
                        longitude: member.longitude,
                      }}
                      title={member.displayName}
                      description={`${member.status} • ${convertDistance(normalizeDistanceValue(member.totalDistance))} • ${convertSpeed(member.speed ?? 0)}`}
                      anchor={{ x: 0.5, y: 1 }}
                    >
                      <View style={styles.memberMarker}>
                        <View style={styles.memberPinHead}>
                          <Image
                            source={
                              member.photoURL
                                ? { uri: member.photoURL }
                                : require("../assets/images/2025-09-26/byc45z4XPi.png")
                            }
                            style={styles.friendMarkerImage}
                          />
                          {member.status === "COMPLETED" && (
                            <View style={styles.completedBadge}>
                              <MaterialIcons
                                name="check-circle"
                                size={16}
                                color="#4CAF50"
                              />
                            </View>
                          )}
                          {member.status === "PAUSED" && (
                            <View style={styles.pausedBadge}>
                              <MaterialIcons
                                name="pause-circle"
                                size={16}
                                color="#FFA726"
                              />
                            </View>
                          )}
                        </View>
                        <View style={styles.memberPinTail} />
                      </View>
                    </Marker>
                  )
              )}

            {/* Solo journey: do not show other users on the map */}
          </MapView>

          {/* Speed Limit Sign */}
          {currentLocation && (
            <SpeedLimitSign latitude={currentLocation.latitude} longitude={currentLocation.longitude} />
          )}

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={handleMinimize}>
                <Image
                  source={require("../assets/images/2025-09-26/qjy0a6B7aU.png")}
                  style={styles.profileImage}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleMinimize}
                style={styles.minimizeButton}
              >
                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={24}
                  color="#000"
                />
              </TouchableOpacity>
            </View>
            <View style={styles.headerRight}>
              <Image
                source={require("../assets/images/2025-09-26/WTtXWrq4i5.png")}
                style={styles.profileImage}
              />

              <TouchableOpacity onPress={handleTakePhoto}>
                <MaterialIcons
                  name="camera-alt"
                  size={24}
                  color="#000"
                  style={styles.cameraIcon}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* SOS Button */}
          <TouchableOpacity style={styles.sosButton}>
            <Image
              source={require("../assets/images/2025-09-26/cGkBkJPGTf.png")}
              style={styles.sosBackground}
            />
            <Text style={styles.sosText}>{t('journey.sos')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClearStuckJourney}
            style={styles.clearButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.clearButtonText}>{t('journey.clearStuckJourney')}</Text>
          </TouchableOpacity>

          {/* Bottom Panel */}
          <View style={styles.bottomPanel}>
            {/* Friends Row */}
            <View style={styles.friendsRow}>
              <View style={styles.friendsContainer}>
                {gJourneyId ? (
                  // Group journey: show group members
                  groupMembers
                    .slice(0, 6)
                    .map((member) => (
                      <Image
                        key={member.id}
                        source={
                          member.photoURL
                            ? { uri: member.photoURL }
                            : require("../assets/images/2025-09-26/byc45z4XPi.png")
                        }
                        style={styles.friendAvatar}
                      />
                    ))
                ) : // Solo journey: show only current user (optional), no other profiles
                user?.photoURL ? (
                  <Image
                    source={{ uri: user.photoURL }}
                    style={styles.friendAvatar}
                  />
                ) : null}
              </View>
            </View>

            {needsDestinationPrompt && (
              <TouchableOpacity
                style={styles.destinationPrompt}
                onPress={handleDestinationPrompt}
                activeOpacity={0.8}
              >
                <MaterialIcons name="flag" size={20} color="#0F172A" style={{ marginRight: 12 }} />
                <View style={styles.destinationPromptTextContainer}>
                  <Text style={styles.destinationPromptTitle}>{t('journey.destinationRequired')}</Text>
                  <Text style={styles.destinationPromptSubtitle} numberOfLines={2}>
                    {t('journey.destinationRequiredSub')}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#0F172A" />
              </TouchableOpacity>
            )}

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {isTracking && stats
                    ? formatTime(Math.floor(stats.totalTime))
                    : "00:00"}
                </Text>
                <Text style={styles.statLabel}>{t('journey.time')}</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.speedContainer}>
                  <Text style={styles.statValue}>
                    {speedMeasurement.value || '0.0'}
                  </Text>
                  <Text style={styles.speedUnit}>{speedMeasurement.unit || 'KM/H'}</Text>
                </View>
                <Text style={styles.statLabel}>{t('journey.speed')}</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.distanceContainer}>
                  <Text style={styles.statValue}>
                    {distanceMeasurement.value || '0.0'}
                  </Text>
                  <Text style={styles.distanceUnit}>{distanceMeasurement.unit || 'KM'}</Text>
                </View>
                <Text style={styles.statLabel}>{t('journey.distance')}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.startButton, isStartBusy && styles.startButtonDisabled]}
                onPress={handleStartJourney}
                disabled={isStartBusy}
                accessibilityLabel={t('journey.toggleRecording')}
                accessibilityHint={isTracking ? t('journey.stopRecording') : t('journey.startRecording')}
              >
                {isStartBusy ? (
                  <ActivityIndicator color="#000" />
                ) : isTracking ? (
                  <MaterialIcons name="stop" size={24} color="#000" />
                ) : (currentJourney?.status === 'paused' || myInstance?.status === 'PAUSED') ? (
                  <MaterialIcons name="play-arrow" size={24} color="#000" />
                ) : (
                  <Animated.Image
                    source={require("../assets/images/2025-09-26/s27abcBOgz.png")}
                    style={[styles.startIcon, { transform: [{ translateX: bikeTranslation }] }]}
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareButton}>
                <Image
                  source={require("../assets/images/2025-09-26/oaseCkwYnL.png")}
                  style={styles.shareIcon}
                />
                <Text style={styles.shareText}>{t('journey.shareLiveLocation')}</Text>
              </TouchableOpacity>
              {gJourneyId && (
                <TouchableOpacity
                  style={styles.timelineButton}
                  onPress={() => setShowTimeline(true)}
                >
                  <MaterialIcons name="timeline" size={20} color="#000" />
                </TouchableOpacity>
              )}
            </View>

            {gJourneyId && <MessageComposer onSend={handleSendMessage} />}
          </View>

          <Modal
            visible={showTimeline}
            animationType="slide"
            transparent
            onRequestClose={() => setShowTimeline(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <RideTimeline
                  events={events}
                  onClose={() => setShowTimeline(false)}
                />
              </View>
            </View>
          </Modal>

          {!isMinimized && (isTracking || currentJourney?.status === 'paused' || gJourneyId) && (
             <TrackingOverlay 
                onStop={handleStopJourney}
                onPause={handlePauseJourney}
                onResume={async () => {
                   await handleResumeIfPaused();
                }}
                isPaused={currentJourney?.status === 'paused' || myInstance?.status === 'PAUSED'}
             />
          )}

          {/* Start Journey Button (Only if NOT tracking and NOT paused) */}
          {!isTracking && currentJourney?.status !== 'paused' && !gJourneyId && (
            <View style={styles.startJourneyContainer}>
              <TouchableOpacity
                style={styles.startJourneyButton}
                onPress={handleStartJourney}
                activeOpacity={0.8}
                disabled={isStartBusy}
              >
                {isStartBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Animated.Image
                      source={require("../assets/images/2025-09-26/byc45z4XPi.png")}
                      style={[
                        styles.startIcon,
                        { transform: [{ translateX: bikeTranslation }] },
                      ]}
                      resizeMode="contain"
                    />
                    <Text style={[styles.startJourneyText, { marginLeft: 10 }]}>{t('journey.startJourney')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  backgroundMap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  clearButton: {
    position: "absolute",
    right: 15,
    top: 532,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 87, 34, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF5722',
  },
  clearButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF5722',
  },
  profileImage: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
  },
  menuIcon: {
    width: 24,
    height: 24,
    position: "absolute",
    left: 11,
    top: 10.5,
  },
  minimizeButton: {
    position: "absolute",
    left: 11,
    top: 10.5,
  },
  settingsIcon: {
    width: 24,
    height: 24,
    position: "absolute",
    right: 11,
    top: 2.5,
  },
  cameraIcon: {
    position: "absolute",
    right: 11,
    top: Platform.OS === "android" ? -10 : 0,
  },
  memberMarker: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  memberPinHead: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0F2424',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 2,
  },
  memberPinTail: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 0,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0F2424',
    marginTop: -2,
    zIndex: 1,
  },
  friendMarkerImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  completedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  pausedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  sosButton: {
    position: "absolute",
    right: 15,
    top: 582,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  sosBackground: {
    position: "absolute",
    width: 30,
    height: 30,
  },
  sosText: {
    fontFamily: "Poppins",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
    color: "#FFFFFF",
  },
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Platform.OS === 'android' ? '#FFFFFF' : 'rgba(255, 251, 251, 0.9)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    height: 215,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  friendsRow: {
    paddingBottom: 12,
  },
  friendsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  destinationPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  destinationPromptTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  destinationPromptTitle: {
    fontFamily: 'Poppins',
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  destinationPromptSubtitle: {
    fontFamily: 'Poppins',
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  addFriendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  addFriendText: {
    fontSize: 20,
    color: "#666666",
    fontWeight: "300",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  statItem: {
    alignItems: "flex-start",
  },
  statValue: {
    fontFamily: "Poppins",
    fontSize: 26,
    fontWeight: "600",
    lineHeight: 39,
    color: "#000000",
  },
  statLabel: {
    fontFamily: "Poppins",
    fontSize: 10,
    lineHeight: 15,
    color: "#202020",
  },
  speedContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  speedUnit: {
    fontFamily: "Poppins",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    color: "#000000",
    marginLeft: 4,
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  distanceUnit: {
    fontFamily: "Poppins",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    color: "#000000",
    marginLeft: 4,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 14,
    paddingTop: 8,
  },
  startButton: {
    backgroundColor: "#BEFFA7",
    borderRadius: 12,
    width: 120,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startIcon: {
    width: 24,
    height: 24,
  },
  shareButton: {
    backgroundColor: "rgba(255, 251, 251, 0.8)",
    borderRadius: 12,
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2.2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  shareIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  shareText: {
    fontFamily: "Poppins",
    fontSize: 14,
    lineHeight: 21,
    color: "#000000",
  },
  stopButton: {
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stopText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  timelineButton: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  resumeButton: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  resumeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "70%",
  },
  startJourneyContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  startJourneyButton: {
    backgroundColor: '#BEFFA7',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  startJourneyText: {
    fontFamily: 'Poppins',
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
});
