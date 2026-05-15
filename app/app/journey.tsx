/**
 * Full-screen active-journey view.
 *
 * Responsibilities:
 * - Full-screen map with an immersive navigation camera that follows the rider
 *   at a pitch/zoom appropriate to current speed.
 * - Smooth marker animation (400 ms, matches 2 Hz GPS) with shortest-angle
 *   heading interpolation and a raw-position bearing fallback when GPS heading
 *   is unavailable.
 * - Live stats overlay (time, speed, distance) wired to useJourneyStats.
 * - Distance-milestone celebrations via RideCelebration.
 * - Directions polyline: MapViewDirections on Android when an API key is
 *   available; manual fetch on iOS (MapViewDirections has layout bugs on iOS).
 * - Screen-wake-lock while tracking so the device never sleeps mid-ride.
 * - JourneyEndModal for post-ride title/photo entry.
 */

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
import JourneyEndModal from '../components/JourneyEndModal';
import { useJourneyState, useJourneyStats } from '../hooks/useJourneyState';
import { useSettings } from '../contexts/SettingsContext';
import { SpeedLimitSign } from '../components/ui/SpeedLimitSign';
import RideCelebration, { CelebrationEvent } from '../components/RideCelebration';
import { snapSinglePoint } from '../services/roads';
import NavArrowMarker from '../components/NavArrowMarker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

type MeasurementParts = { value: string; unit: string };

/** Splits a formatted measurement string (e.g. "12.3 km") into value and unit parts. */
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
  const [showEndModal, setShowEndModal] = useState(false);
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null);
  const [isNavigationMode, setIsNavigationMode] = useState(true);
  const [snappedLocation, setSnappedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const markerPosition = useRef(new AnimatedRegion({
    latitude: region?.latitude || 0,
    longitude: region?.longitude || 0,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  })).current;
  const markerRotation = useRef(new Animated.Value(currentLocation?.heading || 0)).current;
  // Android's Google Maps marker does not rotate when tracksViewChanges=false unless
  // the native Marker.rotation prop receives a real number. Animated.View+transform
  // alone is ignored once tracksViewChanges is off, so we mirror the animated value
  // into React state and pass it via rotation={renderedHeadingDeg}.
  const [renderedHeadingDeg, setRenderedHeadingDeg] = useState<number>(0);
  const lastHeadingRef = useRef<number>(0);
  // Rolling buffer of raw GPS positions for bearing fallback. Fresher than
  // routePoints which come from the snapped path (up to 10 s stale).
  const recentRawPositionsRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const lastCameraUpdateRef = useRef<number>(0);
  const lastCameraSpeedRef = useRef<number>(0);
  const isManuallyPanningRef = useRef<boolean>(false);
  // Records the timestamp of the last user map gesture. Suppresses auto-follow
  // for 3 s after any touch so the camera doesn't fight an in-progress pinch/pan.
  // onTouchStart flips the ref synchronously — onRegionChangeComplete arrives too
  // late to block the next GPS-triggered animateCamera.
  const lastUserGestureAtRef = useRef<number>(0);
  const lastMilestoneRef = useRef(0);
  const startIconAnimation = useRef(new Animated.Value(0)).current;

  const { user } = useAuth();

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

  // Keep the screen awake while a journey is active or paused; release on end
  // so the device can sleep normally between rides.
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

  // Clear stale raw positions when a new journey starts to prevent wrong bearing.
  useEffect(() => {
    if (isTracking) {
      recentRawPositionsRef.current = [];
    }
  }, [isTracking]);

  // ─── Marker animation & heading ──────────────────────────────────────────────

  useEffect(() => {
    if (!currentLocation) return;

    const targetLat = snappedLocation?.latitude ?? currentLocation.latitude;
    const targetLng = snappedLocation?.longitude ?? currentLocation.longitude;

    // Maintain a rolling 5-point raw-GPS buffer for bearing fallback. These
    // positions are fresher than routePoints (snapped, up to 10 s stale).
    const rawPos = { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
    recentRawPositionsRef.current.push(rawPos);
    if (recentRawPositionsRef.current.length > 5) recentRawPositionsRef.current.shift();

    // useSmartTracking already gates heading updates by rawSpeedMps > 0.8.
    // Re-checking smoothed display speed here would suppress a valid heading
    // because display speed decays to 0 within 2–3 frames of stopping.
    const gpsHeading = currentLocation.heading;
    const gpsHasValidHeading =
      typeof gpsHeading === 'number' && gpsHeading >= 0;

    let targetHeading = lastHeadingRef.current;
    if (gpsHasValidHeading) {
      targetHeading = gpsHeading as number;
    } else if (recentRawPositionsRef.current.length >= 2) {
      const recent = recentRawPositionsRef.current;
      const prev = recent[recent.length - 2];
      const curr = recent[recent.length - 1];
      const dLat = curr.latitude - prev.latitude;
      const dLon = curr.longitude - prev.longitude;
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

    // Shortest-angle interpolation: prevents 359°→1° animating the long way around.
    const prevHeading = lastHeadingRef.current;
    let delta = targetHeading - prevHeading;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    const unwrappedTarget = prevHeading + delta;
    const normalizedTarget = ((targetHeading % 360) + 360) % 360;
    lastHeadingRef.current = normalizedTarget;

    // 400 ms duration matches the 500 ms GPS interval (2 Hz) so each animation
    // completes before the next sample arrives — eliminates the "stepping" feel.
    markerPosition.timing({
      latitude: targetLat,
      longitude: targetLng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      duration: 400,
      useNativeDriver: false,
    } as any).start();

    Animated.timing(markerRotation, {
      toValue: unwrappedTarget,
      duration: 400,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    // Only push to React state when change exceeds 1° — avoids re-rendering the
    // marker on every GPS tick during straight-line riding.
    setRenderedHeadingDeg(prev => {
      const diff = Math.abs(((normalizedTarget - prev + 540) % 360) - 180);
      return diff > 1 ? normalizedTarget : prev;
    });
  }, [currentLocation, snappedLocation, markerPosition, markerRotation]);

  // ─── Scheduled journey resume ─────────────────────────────────────────────

  // Handles the case where the user taps a scheduled journey from future-rides
  // screen. The backend has already set the journey status to ACTIVE via
  // /journey/{id}/start — we just need to wire up client-side tracking.
  const scheduledJourneyInitRef = useRef<boolean>(false);
  useEffect(() => {
    const initScheduledJourney = async () => {
      if (!activeJourneyId || typeof activeJourneyId !== 'string' || scheduledJourneyInitRef.current) {
        return;
      }

      if (currentJourney?.id === activeJourneyId && isTracking) {
        console.log('[Journey] Already tracking this journey:', activeJourneyId);
        return;
      }

      console.log('[Journey] Initializing scheduled journey tracking:', activeJourneyId);
      scheduledJourneyInitRef.current = true;
      setIsStartBusy(true);

      try {
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

  // ─── Immersive camera follow ──────────────────────────────────────────────

  // 1 s throttle keeps the camera in sync with 2 Hz GPS without animation pile-up.
  // Previously 2 s caused visible drift to screen edge at highway speed.
  // 3 s cooldown after any user gesture prevents a lingering follow animation
  // from yanking zoom/heading back while the user is still interacting.
  useEffect(() => {
    if (!isTracking || !currentLocation || !isNavigationMode || isManuallyPanningRef.current) return;

    const now = Date.now();
    if (now - lastCameraUpdateRef.current < 1000) return;
    if (now - lastUserGestureAtRef.current < 3000) return;

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
        // Silent — snapping is best-effort; raw coordinates are the fallback.
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

  // ─── Initial map position ─────────────────────────────────────────────────

  useEffect(() => {
    if (!region && !currentJourney?.startLocation) {
      (async () => {
        try {
          let { status } = await Location.getForegroundPermissionsAsync();
          // Do NOT automatically request foreground permissions here — Google Play's
          // prominent disclosure policy requires the disclosure modal to appear first.
          if (status === 'granted') {
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

  // ─── Stats formatting ─────────────────────────────────────────────────────

  const speedMeasurement = useMemo(() => {
    const rawSpeed = currentLocation?.speed || 0;
    // stats.currentSpeed is consolidated km/h from useSmartTracking hooks.
    const speedKmh = stats?.currentSpeed || rawSpeed * 3.6;
    return splitMeasurement(convertSpeed(speedKmh));
  }, [currentLocation?.speed, stats?.currentSpeed, convertSpeed]);

  const distanceMeasurement = useMemo(() => {
    return splitMeasurement(convertDistance(stats?.totalDistance || 0));
  }, [stats?.totalDistance, convertDistance]);

  // ─── Distance milestone celebrations ─────────────────────────────────────

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

  // ─── Map region sync ──────────────────────────────────────────────────────

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

  // Breadcrumb fit — only active when the user has manually exited nav-mode.
  // Previously fired on every routePoints update, yanking the camera back to
  // fit the full breadcrumb each GPS tick (the "map fights the user" problem).
  // Now throttled to once per 8 s and suppressed for 5 s after any touch.
  const lastFitRef = useRef<number>(0);
  useEffect(() => {
    if (currentJourney?.endLocation) return; // route mode handles its own framing
    if (isNavigationMode) return; // follow mode owns the camera
    if (routePoints.length < 2 || !mapRef.current) return;

    const now = Date.now();
    if (now - lastUserGestureAtRef.current < 5000) return;
    if (now - lastFitRef.current < 8000) return;
    lastFitRef.current = now;

    mapRef.current.fitToCoordinates(routePoints, {
      edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
      animated: true,
    });
  }, [routePoints, currentJourney?.endLocation, isNavigationMode]);

  // ─── Directions polyline ──────────────────────────────────────────────────

  const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
    const R = 6371000; // metres
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

  // Recalculate directions when the rider moves > 30 m from the last origin.
  // On iOS (or without an API key) we fetch manually because MapViewDirections
  // has layout issues on iOS; on Android we let MapViewDirections handle updates.
  useEffect(() => {
    const dest = currentJourney?.endLocation;
    if (!dest) return;
    if (routePoints.length === 0) return;

    const current = routePoints[routePoints.length - 1];
    const currentLL = { latitude: current.latitude, longitude: current.longitude };
    const lastOrigin = lastOriginRef.current;

    const shouldRecalc = !lastOrigin || haversine(lastOrigin, currentLL) > 30;
    if (!shouldRecalc) return;

    // iOS prefers manual fetch; Android uses MapViewDirections when key is available.
    const doManual = Platform.OS === 'ios' || !GOOGLE_MAPS_API_KEY;
    if (!doManual) {
      lastOriginRef.current = currentLL;
      return;
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

  // ─── Action handlers ──────────────────────────────────────────────────────

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
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.photoPermission'), t('alerts.cameraNeeded'));
        return;
      }

      // Small delay ensures ActivityResultLauncher is registered on Android
      // before launchCameraAsync — prevents the "unregistered launcher" crash.
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
        return;
      } else {
        throw new Error(t('alerts.noPhotoCaptured'));
      }
    } catch (err: any) {
      console.error('Error taking photo:', err);
      // ActivityResultLauncher errors surface when the camera intent is
      // launched before the launcher is fully registered on some Android OEMs.
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
    if (isTracking || currentJourney?.status === 'paused') {
      setShowEndModal(true);
      return;
    }
    Alert.alert(t('alerts.stopJourneyConfirm'), t('alerts.noActiveStop'));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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
                key={`dir-min-${currentJourney.id}-${currentJourney.endLocation.latitude},${currentJourney.endLocation.longitude}`}
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
            showsUserLocation={!snappedLocation}
            showsMyLocationButton={false}
            showsTraffic={false}
            showsBuildings
            showsIndoors={false}
            mapType={Platform.OS === 'ios' && mapType === 'terrain' ? 'standard' : mapType}
            onTouchStart={() => {
              // Flip synchronously — onRegionChangeComplete fires after release,
              // by which time animateCamera may have already yanked zoom mid-pinch.
              isManuallyPanningRef.current = true;
              lastUserGestureAtRef.current = Date.now();
              setIsNavigationMode(false);
            }}
            onPanDrag={() => {
              // Keeps the cooldown sliding during an active drag on Android.
              lastUserGestureAtRef.current = Date.now();
            }}
            onRegionChangeComplete={(r, { isGesture }) => {
              if (isGesture) {
                isManuallyPanningRef.current = true;
                lastUserGestureAtRef.current = Date.now();
                setIsNavigationMode(false);
                setRegion(r);
              }
              regionRef.current = r;
            }}
          >
            {(snappedLocation || currentLocation) && (
              <Marker.Animated
                coordinate={markerPosition as any}
                anchor={{ x: 0.5, y: 0.5 }}
                flat
                // Android requires the native Marker.rotation prop to rotate the
                // rendered bitmap when tracksViewChanges=false. Animated.View
                // transform is used on iOS where it animates smoothly between snapshots.
                rotation={renderedHeadingDeg}
                tracksViewChanges={Platform.OS === 'android' ? false : undefined}
              >
                <Animated.View
                  style={Platform.OS === 'ios' ? {
                    transform: [{
                      rotate: markerRotation.interpolate({
                        inputRange: [-3600, 3600],
                        outputRange: ['-3600deg', '3600deg'],
                      }),
                    }],
                  } : undefined}
                >
                  <NavArrowMarker size={44} />
                </Animated.View>
              </Marker.Animated>
            )}
            {currentJourney?.endLocation &&
            GOOGLE_MAPS_API_KEY ? (
              <MapViewDirections
                key={`dir-nav-${currentJourney.id}-${currentJourney.endLocation.latitude},${currentJourney.endLocation.longitude}`}
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

          {currentLocation && (
            <SpeedLimitSign latitude={currentLocation.latitude} longitude={currentLocation.longitude} />
          )}

          <RideCelebration
            event={celebrationEvent}
            onDismiss={() => setCelebrationEvent(null)}
          />

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

          <TouchableOpacity
            onPress={handleTakePhoto}
            style={[styles.floatingCameraButton, { bottom: insets.bottom + 230 }]}
          >
            <MaterialIcons name="camera-alt" size={24} color="#fff" />
          </TouchableOpacity>

          {!isNavigationMode && isTracking && (
            <TouchableOpacity
              onPress={() => {
                isManuallyPanningRef.current = false;
                // Reset gesture cooldown so the follow effect isn't suppressed
                // after the user explicitly requests re-entry into nav mode.
                lastUserGestureAtRef.current = 0;
                setIsNavigationMode(true);
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
                // Prime the throttle so the periodic effect doesn't snap again immediately.
                lastCameraUpdateRef.current = Date.now();
              }}
              style={[styles.recenterButton, { bottom: insets.bottom + 295 }]}
            >
              <MaterialIcons name="navigation" size={20} color="#F9A825" />
              <Text style={styles.recenterText}>{t('journey.recenter') || 'Recenter'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.bottomPanel}>
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

      <JourneyEndModal
        visible={showEndModal}
        onDone={(journeyId) => {
          setShowEndModal(false);
          try { router.replace('/(tabs)/map'); } catch { router.push('/(tabs)/map'); }
        }}
      />
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  recenterButton: {
    position: 'absolute',
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 11,
  },
  recenterText: {
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '700',
    color: '#F9A825',
    marginLeft: 8,
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
    // Android ignores backdrop-filter so a solid colour is needed for readability.
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
