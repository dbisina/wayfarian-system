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
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useJourney } from '../contexts/JourneyContext';
import { useAuth } from '../contexts/AuthContext';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fetchDirections, getGoogleMapsApiKey } from '../services/directions';
import { apiRequest } from '../services/api';
import TrackingOverlay from '../components/TrackingOverlay';
import { useJourneyState, useJourneyStats } from '../hooks/useJourneyState';
import { useSettings } from '../contexts/SettingsContext';
import { SpeedLimitSign } from '../components/ui/SpeedLimitSign';
import RideCelebration, { CelebrationEvent } from '../components/RideCelebration';
import { snapSinglePoint } from '../services/roads';
import NavArrowMarker from '../components/NavArrowMarker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

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


const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function JourneyScreen(): React.JSX.Element {
  const { activeJourneyId } = useLocalSearchParams<{ activeJourneyId?: string }>();
  const {
    routePoints,
    startJourney,
    pauseJourney,
    resumeJourney,
    resumeActiveJourney,
    endJourney,
    addPhoto,
    minimizeJourney,
    currentLocation,
  } = useJourney();
  const { t } = useTranslation();
  const { currentJourney, isTracking, isMinimized } = useJourneyState();
  const stats = useJourneyStats();
  const { convertDistance, convertSpeed, mapType, vehicle: settingsVehicle } = useSettings();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const regionRef = useRef<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [manualRouteCoords, setManualRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const lastOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [isStartBusy, setIsStartBusy] = useState(false);
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null);
  const [isNavigationMode, setIsNavigationMode] = useState(true); // Default to following user
  const [snappedLocation, setSnappedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const markerPosition = useRef(new AnimatedRegion({
    latitude: region?.latitude || 0,
    longitude: region?.longitude || 0,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  })).current;
  const markerRotation = useRef(new Animated.Value(currentLocation?.heading || 0)).current;
  const lastHeadingRef = useRef<number>(0);
  const lastCameraUpdateRef = useRef<number>(0);
  const lastCameraSpeedRef = useRef<number>(0);
  const isManuallyPanningRef = useRef<boolean>(false);
  const lastMilestoneRef = useRef(0);
  const startIconAnimation = useRef(new Animated.Value(0)).current;

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

  // Keep the screen awake while a journey is being tracked or paused.
  // Release it as soon as tracking ends so the device can sleep normally.
  useEffect(() => {
    const shouldKeepAwake = isTracking || currentJourney?.status === 'paused';
    const tag = 'wayfarian-journey';
    if (shouldKeepAwake) {
      activateKeepAwakeAsync(tag).catch(() => {});
      return () => {
        deactivateKeepAwake(tag);
      };
    }
    return undefined;
  }, [isTracking, currentJourney?.status]);

  // Handle Marker Animation & Smoothing
  useEffect(() => {
    if (!currentLocation) return;

    const targetLat = snappedLocation?.latitude ?? currentLocation.latitude;
    const targetLng = snappedLocation?.longitude ?? currentLocation.longitude;

    // Compute heading: prefer valid GPS heading (needs speed > ~0.5 m/s to be trustworthy),
    // otherwise compute bearing from last route point to current, else keep previous.
    const gpsHeading = currentLocation.heading;
    const gpsSpeed = currentLocation.speed || 0;
    const gpsHasValidHeading =
      typeof gpsHeading === 'number' && gpsHeading >= 0 && gpsSpeed > 0.8;

    let targetHeading = lastHeadingRef.current;
    if (gpsHasValidHeading) {
      targetHeading = gpsHeading as number;
    } else if (routePoints.length >= 2) {
      const prev = routePoints[routePoints.length - 2];
      const curr = routePoints[routePoints.length - 1];
      const dLat = curr.latitude - prev.latitude;
      const dLon = curr.longitude - prev.longitude;
      // Only recompute if we actually moved a tiny bit
      if (Math.abs(dLat) + Math.abs(dLon) > 1e-6) {
        const y = Math.sin((dLon * Math.PI) / 180) * Math.cos((curr.latitude * Math.PI) / 180);
        const x =
          Math.cos((prev.latitude * Math.PI) / 180) * Math.sin((curr.latitude * Math.PI) / 180) -
          Math.sin((prev.latitude * Math.PI) / 180) * Math.cos((curr.latitude * Math.PI) / 180) *
            Math.cos((dLon * Math.PI) / 180);
        const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        targetHeading = bearing;
      }
    }

    // Shortest-angle interpolation: avoid 359°→1° going the long way.
    const prevHeading = lastHeadingRef.current;
    let delta = targetHeading - prevHeading;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    const unwrappedTarget = prevHeading + delta;
    lastHeadingRef.current = ((targetHeading % 360) + 360) % 360;

    // Smoothly animate the marker to the new position
    markerPosition.timing({
      latitude: targetLat,
      longitude: targetLng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      duration: 900,
      useNativeDriver: false,
    } as any).start();

    Animated.timing(markerRotation, {
      toValue: unwrappedTarget,
      duration: 400,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [currentLocation, snappedLocation, routePoints, markerPosition, markerRotation]);

  // Handle scheduled journey start via activeJourneyId param
  // This is triggered when user starts a scheduled journey from future-rides screen
  // The journey has already been started (status changed to ACTIVE) via /journey/{id}/start
  // We just need to set up client-side tracking for it
  const scheduledJourneyInitRef = useRef<boolean>(false);
  useEffect(() => {
    const initScheduledJourney = async () => {
      // Only process if we have an activeJourneyId and haven't already initialized
      if (!activeJourneyId || typeof activeJourneyId !== 'string' || scheduledJourneyInitRef.current) {
        return;
      }

      // Skip if we already have an active journey that matches
      if (currentJourney?.id === activeJourneyId && isTracking) {
        console.log('[Journey] Already tracking this journey:', activeJourneyId);
        return;
      }

      console.log('[Journey] Initializing scheduled journey tracking:', activeJourneyId);
      scheduledJourneyInitRef.current = true;
      setIsStartBusy(true);

      try {
        // Use resumeActiveJourney to set up tracking for the existing ACTIVE journey
        // This properly fetches the journey and starts client-side tracking
        const success = await resumeActiveJourney(activeJourneyId);

        if (!success) {
          console.warn('[Journey] Failed to resume tracking for scheduled journey');
          Alert.alert(t('alerts.error'), t('alerts.startJourneyError'));
        } else {
          console.log('[Journey] Successfully started tracking scheduled journey');
        }
      } catch (error) {
        console.error('[Journey] Error initializing scheduled journey:', error);
        Alert.alert(t('alerts.error'), t('alerts.startJourneyError'));
      } finally {
        setIsStartBusy(false);
      }
    };

    initScheduledJourney();
  }, [activeJourneyId, currentJourney?.id, isTracking, resumeActiveJourney, t]);

  // Handle Immersive Camera Following & Road Snapping.
  // Throttled to every 2 seconds to stop fighting user gestures and reduce camera churn.
  useEffect(() => {
    if (!isTracking || !currentLocation || !isNavigationMode || isManuallyPanningRef.current) return;

    const now = Date.now();
    if (now - lastCameraUpdateRef.current < 2000) return;

    const updateCamera = async () => {
      if (!mapRef.current) return;

      lastCameraUpdateRef.current = now;

      try {
        const snapped = await snapSinglePoint({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        });
        if (snapped) setSnappedLocation(snapped);
      } catch (e) {
        // Silent
      }

      const rawSpeedKmh = (currentLocation.speed || 0) * 3.6;
      const smoothedSpeed = lastCameraSpeedRef.current + 0.2 * (rawSpeedKmh - lastCameraSpeedRef.current);
      lastCameraSpeedRef.current = smoothedSpeed;

      let targetZoom = 18;
      let targetPitch = 45;
      if (smoothedSpeed > 80) {
        targetZoom = 16.5;
        targetPitch = 55;
      } else if (smoothedSpeed > 40) {
        targetZoom = 17.5;
        targetPitch = 50;
      }

      // Use last computed heading (GPS when valid, bearing fallback otherwise).
      // Falls back to 0 only on very first frame before any heading is computed.
      const cameraHeading = lastHeadingRef.current;

      mapRef.current.animateCamera({
        center: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        pitch: targetPitch,
        heading: cameraHeading,
        altitude: smoothedSpeed > 60 ? 1000 : 600,
        zoom: targetZoom,
      }, { duration: 900 });
    };

    updateCamera();
  }, [currentLocation, isTracking, isNavigationMode]);

  // Initialize map with current location if no region set
  useEffect(() => {
    if (!region && !currentJourney?.startLocation) {
      (async () => {
        try {
          let { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') {
            const req = await Location.requestForegroundPermissionsAsync();
            status = req.status;
          }
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
          }
        } catch (e) {
          console.warn('Failed to get current location for map:', e);
        }
      })();
    }
  }, [currentJourney?.startLocation]);


  const speedMeasurement = useMemo(() => {
    // currentLocation.speed is raw m/s from native GPS
    const rawSpeed = currentLocation?.speed || 0;
    // Standard: stats.currentSpeed is now reliable km/h from our consolidated hooks
    const speedKmh = stats?.currentSpeed || rawSpeed * 3.6;
    return splitMeasurement(convertSpeed(speedKmh));
  }, [currentLocation?.speed, stats?.currentSpeed, convertSpeed]);

  const distanceMeasurement = useMemo(() => {
    // stats.totalDistance is in km
    return splitMeasurement(convertDistance(stats?.totalDistance || 0));
  }, [stats?.totalDistance, convertDistance]);

  // Distance milestone celebrations
  useEffect(() => {
    if (!isTracking || !stats?.totalDistance) return;
    const distKm = stats.totalDistance;
    const milestones = [5, 10, 25, 50, 100];
    for (const km of milestones) {
      if (distKm >= km && lastMilestoneRef.current < km) {
        lastMilestoneRef.current = km;
        setCelebrationEvent({
          id: `dist-${km}`,
          title: `${km} km reached!`,
          subtitle: 'Keep going!',
          xp: km >= 50 ? 50 : 25,
          icon: 'trophy',
        });
        break;
      }
    }
  }, [isTracking, stats?.totalDistance]);

  const bikeTranslation = startIconAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 6],
  });


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

    if (currentJourney?.status === 'paused') {
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
        vehicle: settingsVehicle,
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
        allowsEditing: false,
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
      await pauseJourney();
    } catch (e) {
      console.warn('Pause error', e);
    }
  };

  const handleStopJourney = async () => {
    try {
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
            mapType={Platform.OS === 'ios' && mapType === 'terrain' ? 'standard' : mapType}
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
                onError={(err) => console.warn("Directions error:", err)}
              />
            ) : currentJourney?.endLocation &&
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
            showsUserLocation={!snappedLocation} // Only show native blue dot if not snapped
            showsMyLocationButton={false}
            showsTraffic={false}
            showsBuildings
            showsIndoors={false}
            mapType={Platform.OS === 'ios' && mapType === 'terrain' ? 'standard' : mapType}
            onRegionChangeComplete={(r, { isGesture }) => {
              // Only disable navigation mode if the user actually manually interacted with the map
              if (isGesture) {
                isManuallyPanningRef.current = true;
                setIsNavigationMode(false);
                setRegion(r); // Trigger re-render only on manual interaction
              }
              regionRef.current = r;
            }}
          >
            {(snappedLocation || currentLocation) && (
              <Marker.Animated
                coordinate={markerPosition as any}
                anchor={{ x: 0.5, y: 0.5 }}
                flat
                tracksViewChanges={Platform.OS === 'android' ? false : undefined}
              >
                <Animated.View style={{ transform: [{ rotate: markerRotation.interpolate({
                  inputRange: [-3600, 3600],
                  outputRange: ['-3600deg', '3600deg'],
                }) }] }}>
                  <NavArrowMarker size={44} />
                </Animated.View>
              </Marker.Animated>
            )}
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

            {currentJourney?.startLocation && (
              <Marker
                coordinate={{
                  latitude: currentJourney.startLocation.latitude,
                  longitude: currentJourney.startLocation.longitude,
                }}
                title={t('group.startLocation')}
                pinColor="green"
              />
            )}

            {currentJourney?.endLocation && (
              <Marker
                coordinate={{
                  latitude: currentJourney.endLocation.latitude,
                  longitude: currentJourney.endLocation.longitude,
                }}
                title={t('group.destination')}
                pinColor="red"
              />
            )}
          </MapView>

          {/* Speed Limit Sign */}
          {currentLocation && (
            <SpeedLimitSign latitude={currentLocation.latitude} longitude={currentLocation.longitude} />
          )}

          {/* Ride Celebration Toast */}
          <RideCelebration
            event={celebrationEvent}
            onDismiss={() => setCelebrationEvent(null)}
          />

          {/* Header - with SafeArea top padding */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
            <View style={styles.headerRight} />
          </View>

          {/* Floating Camera Button */}
          <TouchableOpacity onPress={handleTakePhoto} style={styles.floatingCameraButton}>
            <MaterialIcons name="camera-alt" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Recenter Button (Navigation Mode) */}
          {!isNavigationMode && isTracking && (
            <TouchableOpacity 
              onPress={() => {
                isManuallyPanningRef.current = false;
                setIsNavigationMode(true);
                // Instant sync animation when recentering
                if (mapRef.current && currentLocation) {
                  const speedKmh = (currentLocation.speed || 0) * 3.6;
                  let targetZoom = 18;
                  let targetPitch = 45;

                  if (speedKmh > 80) {
                    targetZoom = 16.5;
                    targetPitch = 55;
                  } else if (speedKmh > 40) {
                    targetZoom = 17.5;
                    targetPitch = 50;
                  }

                  mapRef.current.animateCamera({
                    center: {
                      latitude: currentLocation.latitude,
                      longitude: currentLocation.longitude,
                    },
                    pitch: targetPitch,
                    heading: lastHeadingRef.current,
                    zoom: targetZoom,
                  }, { duration: 600 });
                }
                // Prime the throttle so the periodic effect doesn't snap again immediately
                lastCameraUpdateRef.current = Date.now();
              }}
              style={styles.recenterButton}
            >
              <MaterialIcons name="navigation" size={24} color="#000" />
              <Text style={styles.recenterText}>{t('journey.recenter') || 'Recenter'}</Text>
            </TouchableOpacity>
          )}

          {/* Bottom Panel */}
          <View style={styles.bottomPanel}>
            {/* Friends Row */}
            <View style={styles.friendsRow}>
              <View style={styles.friendsContainer}>
                {user?.photoURL ? (
                  <Image
                    source={{ uri: user.photoURL }}
                    style={styles.friendAvatar}
                  />
                ) : null}
              </View>
            </View>

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
                ) : currentJourney?.status === 'paused' ? (
                  <MaterialIcons name="play-arrow" size={24} color="#000" />
                ) : (
                  <Animated.Image
                    source={require("../assets/images/custom/start_ride.png")}
                    style={[styles.startIcon, { width: 32, height: 32, transform: [{ translateX: bikeTranslation }] }]}
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
            </View>
          </View>

          {!isMinimized && (isTracking || currentJourney?.status === 'paused') && (
             <TrackingOverlay 
                onStop={handleStopJourney}
                onPause={handlePauseJourney}
                onResume={async () => {
                   await handleResumeIfPaused();
                }}
                isPaused={currentJourney?.status === 'paused'}
             />
          )}

          {/* Start Journey Button (Only if NOT tracking and NOT paused) */}
          {!isTracking && currentJourney?.status !== 'paused' && (
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
    // paddingTop is now set dynamically with SafeArea insets
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
  floatingCameraButton: {
    position: 'absolute',
    right: 15,
    top: 532,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  recenterButton: {
    position: 'absolute',
    right: 15,
    top: 590,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 11,
  },
  recenterText: {
    marginLeft: 8,
    fontWeight: 'bold',
    fontSize: 14,
    color: '#000',
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
