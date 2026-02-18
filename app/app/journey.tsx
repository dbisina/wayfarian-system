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
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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
  const { convertDistance, convertSpeed, mapType } = useSettings();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [manualRouteCoords, setManualRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const lastOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [isStartBusy, setIsStartBusy] = useState(false);
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null);
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

  // Initialize map with current location if no region set
  useEffect(() => {
    if (!region && !currentJourney?.startLocation) {
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
  }, [region, currentJourney?.startLocation]);


  const speedMeasurement = useMemo(() => {
    const value = isTracking && stats ? stats.currentSpeed : 0;
    return splitMeasurement(convertSpeed(value));
  }, [convertSpeed, isTracking, stats]);

  const distanceMeasurement = useMemo(() => {
    const value = isTracking && stats ? stats.totalDistance : 0;
    return splitMeasurement(convertDistance(value));
  }, [convertDistance, isTracking, stats]);

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
        vehicle: 'car',
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
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
