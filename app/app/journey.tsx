import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useJourney } from '../contexts/JourneyContext';
import { useAuth } from '../contexts/AuthContext';
import { router, useLocalSearchParams } from 'expo-router';
import { apiRequest } from '../services/api';
import { fetchDirections, getGoogleMapsApiKey } from '../services/directions';
import RideTimeline from '../components/RideTimeline';
import MessageComposer from '../components/MessageComposer';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { useGroupJourney } from '../hooks/useGroupJourney';
import { getSocket } from '../services/socket';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function JourneyScreen(): React.JSX.Element {
  const { groupId: paramGroupId, groupJourneyId } = useLocalSearchParams<{ groupId?: string; groupJourneyId?: string }>();
  const {
    currentJourney,
    isTracking,
    isMinimized,
    stats,
    routePoints,
    groupMembers,
    startJourney,
    resumeJourney,
    endJourney,
    addPhoto,
    minimizeJourney,
    loadGroupMembers,
  } = useJourney();

  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [manualRouteCoords, setManualRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const lastOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [groupView, setGroupView] = useState<{ start?: { latitude: number; longitude: number }; end?: { latitude: number; longitude: number } } | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // Real-time events for group journeys
  const gJourneyId = typeof groupJourneyId === 'string' ? groupJourneyId : undefined;
  const { events, postEvent } = useRealtimeEvents({ groupJourneyId: gJourneyId });

  // Group journey real-time coordination
  const socket = getSocket();
  const {
    memberLocations,
    isTracking: isGroupTracking,
    startLocationTracking,
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

  // If navigated with a groupId param, load group members overlay
  useEffect(() => {
    const gid = typeof paramGroupId === 'string' ? paramGroupId : undefined;
    if (!gid) return;
    // Load once when arriving with param
    loadGroupMembers(gid).catch(() => {});
  }, [paramGroupId, loadGroupMembers]);

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
          console.log('📍 Loaded my group journey instance:', instance);
          
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
    if (!isTracking) {
      const success = await startJourney({
        title: 'My Journey',
        vehicle: 'car',
        groupId: currentJourney?.groupId,
      });
      if (!success) {
        Alert.alert('Error', 'Failed to start journey tracking');
      }
    } else {
      Alert.alert(
        'Stop Journey',
        'Are you sure you want to stop this journey?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: async () => { await endJourney(); } },
        ]
      );
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
        Alert.alert('Permission needed', 'Camera permission is required to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        await addPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
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

  const formatSpeed = (speed: number): string => speed.toFixed(1);
  const formatDistance = (distance: number): string => distance.toFixed(1);

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
        Alert.alert('Resume', 'No paused journey to resume.');
      }
    } catch (e) {
      console.warn('Failed to resume journey:', e);
      Alert.alert('Error', 'Failed to resume. Please try again.');
    }
  };

  const handleStopJourney = async () => {
    try {
      // Group journey instance complete
      if (gJourneyId && myInstance?.id && (myInstance.status === 'ACTIVE' || myInstance.status === 'PAUSED')) {
        Alert.alert(
          'Stop Journey',
          'Are you sure you want to stop and complete your group journey?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Stop', style: 'destructive', onPress: async () => {
              try {
                await apiRequest(`/group-journey/instance/${myInstance.id}/complete`, { method: 'POST' });
                // Navigate away after stopping
                try { router.replace('/(tabs)/map'); } catch { router.push('/(tabs)/map'); }
              } catch {
                Alert.alert('Error', 'Failed to stop group journey. Please try again.');
              }
            }}
          ]
        );
        return;
      }

      // Solo journey complete
      if (isTracking || currentJourney?.status === 'paused') {
        Alert.alert(
          'Stop Journey',
          'Are you sure you want to stop your journey?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Stop', style: 'destructive', onPress: async () => {
              await endJourney();
              try { router.replace('/(tabs)/map'); } catch { router.push('/(tabs)/map'); }
            }}
          ]
        );
        return;
      }

      Alert.alert('Stop Journey', 'No active or paused journey to stop.');
    } catch {
      Alert.alert('Error', 'Failed to stop journey.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {isMinimized ? (
        <>
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={styles.backgroundMap}
            region={region}
            showsUserLocation
            showsMyLocationButton={false}
            showsTraffic={false}
            showsBuildings
            showsIndoors={false}
            mapType="standard"
          >
            {Platform.OS === 'android' && (currentJourney?.endLocation || groupView?.end) && GOOGLE_MAPS_API_KEY ? (
              <MapViewDirections
                origin={routePoints.length > 0
                  ? { latitude: routePoints[routePoints.length - 1].latitude, longitude: routePoints[routePoints.length - 1].longitude }
                  : currentJourney?.startLocation
                    ? { latitude: currentJourney.startLocation.latitude, longitude: currentJourney.startLocation.longitude }
                    : groupView?.start
                      ? { latitude: groupView.start.latitude, longitude: groupView.start.longitude }
                      : { latitude: region.latitude, longitude: region.longitude }}
                destination={currentJourney?.endLocation
                  ? { latitude: currentJourney.endLocation.latitude, longitude: currentJourney.endLocation.longitude }
                  : groupView?.end
                    ? { latitude: groupView.end.latitude, longitude: groupView.end.longitude }
                    : undefined as any}
                apikey={GOOGLE_MAPS_API_KEY}
                mode="DRIVING"
                strokeWidth={5}
                strokeColor="#2B8CFF"
                optimizeWaypoints
                onError={(err) => console.warn('Directions error:', err)}
              />
            ) : (currentJourney?.endLocation || groupView?.end) && manualRouteCoords.length > 1 ? (
              <Polyline coordinates={manualRouteCoords} strokeWidth={5} strokeColor="#2B8CFF" />
            ) : routePoints.length > 1 ? (
              <Polyline coordinates={routePoints} strokeWidth={4} strokeColor="#2B8CFF" />
            ) : null}
          </MapView>
        </>
      ) : (
        <>
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={styles.backgroundMap}
            region={region}
            showsUserLocation
            showsMyLocationButton={false}
            showsTraffic={false}
            showsBuildings
            showsIndoors={false}
            mapType="standard"
          >
            {Platform.OS === 'android' && currentJourney?.endLocation && GOOGLE_MAPS_API_KEY ? (
              <MapViewDirections
                origin={routePoints.length > 0
                  ? { latitude: routePoints[routePoints.length - 1].latitude, longitude: routePoints[routePoints.length - 1].longitude }
                  : currentJourney?.startLocation
                    ? { latitude: currentJourney.startLocation.latitude, longitude: currentJourney.startLocation.longitude }
                    : { latitude: region.latitude, longitude: region.longitude }}
                destination={{
                  latitude: currentJourney.endLocation.latitude,
                  longitude: currentJourney.endLocation.longitude,
                }}
                apikey={GOOGLE_MAPS_API_KEY}
                mode="DRIVING"
                strokeWidth={5}
                strokeColor="#2B8CFF"
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
            ) : currentJourney?.endLocation && manualRouteCoords.length > 1 ? (
              <Polyline coordinates={manualRouteCoords} strokeWidth={5} strokeColor="#2B8CFF" />
            ) : !currentJourney?.endLocation && routePoints.length > 1 ? (
              <Polyline coordinates={routePoints} strokeWidth={4} strokeColor="#2B8CFF" />
            ) : null}

            {(currentJourney?.startLocation || groupView?.start) && (
              <Marker
                coordinate={{
                  latitude: (currentJourney?.startLocation?.latitude ?? groupView!.start!.latitude),
                  longitude: (currentJourney?.startLocation?.longitude ?? groupView!.start!.longitude),
                }}
                title="Start Location"
                pinColor="green"
              />
            )}

            {(currentJourney?.endLocation || groupView?.end) && (
              <Marker
                coordinate={{
                  latitude: (currentJourney?.endLocation?.latitude ?? groupView!.end!.latitude),
                  longitude: (currentJourney?.endLocation?.longitude ?? groupView!.end!.longitude),
                }}
                title="Destination"
                pinColor="red"
              />
            )}

            {/* Show member locations for group journeys */}
            {gJourneyId && memberLocations.map((member) => (
              member.latitude && member.longitude && (
                <Marker
                  key={member.userId}
                  coordinate={{
                    latitude: member.latitude,
                    longitude: member.longitude,
                  }}
                  title={member.displayName}
                  description={`${member.status} • ${(member.totalDistance / 1000).toFixed(1)} km • ${member.speed?.toFixed(1) || 0} km/h`}
                >
                  <View style={styles.memberMarker}>
                    <Image
                      source={{ uri: member.photoURL || 'https://static.codia.ai/image/2025-09-26/byc45z4XPi.png' }}
                      style={styles.friendMarkerImage}
                    />
                    {member.status === 'COMPLETED' && (
                      <View style={styles.completedBadge}>
                        <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      </View>
                    )}
                    {member.status === 'PAUSED' && (
                      <View style={styles.pausedBadge}>
                        <MaterialIcons name="pause-circle" size={16} color="#FFA726" />
                      </View>
                    )}
                  </View>
                </Marker>
              )
            ))}

            {/* Solo journey: do not show other users on the map */}
          </MapView>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={handleMinimize}>
                <Image
                  source={{ uri: 'https://static.codia.ai/image/2025-09-26/qjy0a6B7aU.png' }}
                  style={styles.profileImage}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMinimize} style={styles.minimizeButton}>
                <MaterialIcons name="keyboard-arrow-down" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.headerRight}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/WTtXWrq4i5.png' }}
                style={styles.profileImage}
              />
              <TouchableOpacity onPress={handleTakePhoto}>
                <MaterialIcons name="camera-alt" size={24} color="#000" style={styles.cameraIcon} />
              </TouchableOpacity>
            </View>
          </View>

          {/* SOS Button */}
          <TouchableOpacity style={styles.sosButton}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/cGkBkJPGTf.png' }}
              style={styles.sosBackground}
            />
            <Text style={styles.sosText}>SOS</Text>
          </TouchableOpacity>

          {/* Bottom Panel */}
          <View style={styles.bottomPanel}>
            {/* Friends Row */}
            <View style={styles.friendsRow}>
              <View style={styles.friendsContainer}>
                {gJourneyId ? (
                  // Group journey: show group members
                  groupMembers.slice(0, 6).map((member) => (
                    <Image
                      key={member.id}
                      source={{ uri: member.photoURL || 'https://static.codia.ai/image/2025-09-26/byc45z4XPi.png' }}
                      style={styles.friendAvatar}
                    />
                  ))
                ) : (
                  // Solo journey: show only current user (optional), no other profiles
                  user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.friendAvatar} />
                  ) : null
                )}
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {isTracking && stats ? formatTime(Math.floor(stats.totalTime)) : '00:00'}
                </Text>
                <Text style={styles.statLabel}>Time</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.speedContainer}>
                  <Text style={styles.statValue}>
                    {isTracking && stats ? formatSpeed(stats.currentSpeed) : '0.0'}
                  </Text>
                  <Text style={styles.speedUnit}>KPH</Text>
                </View>
                <Text style={styles.statLabel}>Speed</Text>
              </View>
              <View style={styles.statItem}>
                <View style={styles.distanceContainer}>
                  <Text style={styles.statValue}>
                    {isTracking && stats ? formatDistance(stats.totalDistance) : '0.0'}
                  </Text>
                  <Text style={styles.distanceUnit}>KM</Text>
                </View>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              {(currentJourney?.status === 'paused' || myInstance?.status === 'PAUSED') && (
                <TouchableOpacity style={[styles.resumeButton]} onPress={handleResumeIfPaused}>
                  <MaterialIcons name="play-arrow" size={24} color="#fff" />
                  <Text style={styles.resumeText}>Resume</Text>
                </TouchableOpacity>
              )}
              {(isTracking || currentJourney?.status === 'paused' || (gJourneyId && (myInstance?.status === 'ACTIVE' || myInstance?.status === 'PAUSED'))) && (
                <TouchableOpacity style={styles.stopButton} onPress={handleStopJourney}>
                  <MaterialIcons name="stop" size={20} color="#fff" />
                  <Text style={styles.stopText}>Stop</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.startButton} onPress={handleStartJourney}>
                {isTracking ? (
                  <MaterialIcons name="stop" size={24} color="#000" />
                ) : (
                  <Image
                    source={{ uri: 'https://static.codia.ai/image/2025-09-26/s27abcBOgz.png' }}
                    style={styles.startIcon}
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareButton}>
                <Image
                  source={{ uri: 'https://static.codia.ai/image/2025-09-26/oaseCkwYnL.png' }}
                  style={styles.shareIcon}
                />
                <Text style={styles.shareText}>Share live location</Text>
              </TouchableOpacity>
              {gJourneyId && (
                <TouchableOpacity style={styles.timelineButton} onPress={() => setShowTimeline(true)}>
                  <MaterialIcons name="timeline" size={20} color="#000" />
                </TouchableOpacity>
              )}
            </View>

            {gJourneyId && <MessageComposer onSend={handleSendMessage} />}
          </View>

          <Modal visible={showTimeline} animationType="slide" transparent onRequestClose={() => setShowTimeline(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <RideTimeline events={events} onClose={() => setShowTimeline(false)} />
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundMap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
  },
  menuIcon: {
    width: 24,
    height: 24,
    position: 'absolute',
    left: 11,
    top: 10.5,
  },
  minimizeButton: {
    position: 'absolute',
    left: 11,
    top: 10.5,
  },
  settingsIcon: {
    width: 24,
    height: 24,
    position: 'absolute',
    right: 11,
    top: 2.5,
  },
  cameraIcon: {
    position: 'absolute',
    right: 11,
    top: 10.5,
  },
  memberMarker: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendMarkerImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#0F2424',
  },
  completedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButton: {
    position: 'absolute',
    right: 15,
    top: 582,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBackground: {
    position: 'absolute',
    width: 30,
    height: 30,
  },
  sosText: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
    color: '#FFFFFF',
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 251, 251, 0.9)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    height: 215,
  },
  friendsRow: {
    paddingBottom: 12,
  },
  friendsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendText: {
    fontSize: 20,
    color: '#666666',
    fontWeight: '300',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  statItem: {
    alignItems: 'flex-start',
  },
  statValue: {
    fontFamily: 'Poppins',
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 39,
    color: '#000000',
  },
  statLabel: {
    fontFamily: 'Poppins',
    fontSize: 10,
    lineHeight: 15,
    color: '#202020',
  },
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  speedUnit: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    color: '#000000',
    marginLeft: 4,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distanceUnit: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    color: '#000000',
    marginLeft: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 8,
  },
  startButton: {
    backgroundColor: '#BEFFA7',
    borderRadius: 12,
    width: 120,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startIcon: {
    width: 24,
    height: 24,
  },
  shareButton: {
    backgroundColor: 'rgba(255, 251, 251, 0.8)',
    borderRadius: 12,
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
    fontFamily: 'Poppins',
    fontSize: 14,
    lineHeight: 21,
    color: '#000000',
  },
  stopButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  timelineButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  resumeButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resumeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
  },
});
