// app/hooks/useGroupJourney.ts
// Resilient group journey hook with socket lifecycle + location tracking tied into Redux

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import type { Socket } from 'socket.io-client';
import { useAppDispatch } from '../store/hooks';
import {
  hydrateMembersFromSnapshot,
  mergeMemberLocation,
  setGroupJourney as setGroupJourneyState,
  setGroupTracking,
  setMyInstance as setMyInstanceState,
  setStats,
} from '../store/slices/journeySlice';
import type { JourneyInstance } from '../store/slices/journeySlice';
import {
  useGroupTracking,
  useJourneyMembers,
  useJourneyState,
  useJourneyLocations,
} from './useJourneyState';
import LiveNotificationService, { JourneyNotificationData } from '../services/liveNotificationService';

export interface MemberLocation {
  instanceId: string;
  userId: string;
  displayName: string;
  photoURL?: string;
  latitude?: number;
  longitude?: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  totalDistance?: number;
  totalTime?: number;
  speed?: number;
  heading?: number;
  lastUpdate?: string;
}

interface UseGroupJourneyProps {
  socket: Socket | null;
  groupJourneyId?: string;
  autoStart?: boolean;
}

const LOCATION_INTERVAL_MS = 2000;
const LOCATION_DISTANCE_METERS = 5;

// Haversine distance in km — used as fallback when useSmartTracking GPS conflicts on Android
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const MIN_ACCURACY_FOR_DISTANCE = 25; // metres — ignore inaccurate fixes

export const useGroupJourney = ({
  socket,
  groupJourneyId,
  autoStart = false,
}: UseGroupJourneyProps) => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isJoined, setIsJoined] = useState(false);
  const journeyState = useJourneyState();
  const members = useJourneyMembers();
  const memberLocationsMap = useJourneyLocations();
  const groupTracking = useGroupTracking();
  const myInstance = journeyState.myInstance;
  const groupJourney = journeyState.groupJourney;

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastEmitRef = useRef(0);
  const myInstanceRef = useRef<JourneyInstance | null>(null);
  // Track when the client actually started tracking (not server startTime which has latency)
  const clientStartTimeRef = useRef<number | null>(null);
  // Track current speed from GPS for stats display
  const currentSpeedRef = useRef<number>(0);
  // Throttle live notification updates
  const lastNotificationUpdateRef = useRef<number>(0);
  // Local distance accumulation (Haversine fallback for Android where dual GPS watchers conflict)
  const localDistanceRef = useRef<number>(0);
  const lastLocationForDistanceRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Track local top speed (km/h) as fallback
  const localTopSpeedRef = useRef<number>(0);
  // Track myInstance.id to detect new journey starts and reset refs
  const prevInstanceIdRef = useRef<string | null>(null);

  const statsRef = useRef(journeyState.stats);
  statsRef.current = journeyState.stats;
  const currentJourneyRef = useRef(journeyState.currentJourney);
  currentJourneyRef.current = journeyState.currentJourney;

  // Use refs for frequently-changing values to avoid recreating the timer interval
  const membersRef = useRef(members);
  membersRef.current = members;
  const memberInstancesRef = useRef(journeyState.memberInstances);
  memberInstancesRef.current = journeyState.memberInstances;

  // Track whether myInstance is active for the timer (stable boolean to avoid interval churn)
  // Must also check status — a COMPLETED/CANCELLED instance from Redux persist still has startTime
  const isInstanceActive = !!(myInstance && myInstance.startTime
    && (myInstance.status === 'ACTIVE' || myInstance.status === 'PAUSED'));

  useEffect(() => {
    myInstanceRef.current = myInstance;
    // Reset timer and local tracking refs when switching to a new instance
    const newId = myInstance?.id ?? null;
    if (newId !== prevInstanceIdRef.current) {
      prevInstanceIdRef.current = newId;
      clientStartTimeRef.current = null;
      localDistanceRef.current = 0;
      lastLocationForDistanceRef.current = null;
      localTopSpeedRef.current = 0;
      currentSpeedRef.current = 0;
    }
  }, [myInstance]);

  useEffect(() => {
    if (!isInstanceActive) return;

    // Set client start time on first activation (avoids server latency offset)
    if (!clientStartTimeRef.current) {
      clientStartTimeRef.current = Date.now();
    }
    // Update timer every second.
    // Use max(smartTrackingDistance, localHaversineDistance) so that:
    //   - On iOS, useSmartTracking (Roads API) provides the best distance and "wins"
    //   - On Android, where dual GPS watchers conflict, local Haversine fallback provides data
    const updateTimer = () => {
      const startTime = clientStartTimeRef.current!;
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const currentStats = statsRef.current;

      // Best-of: smart tracking distance vs local Haversine accumulation
      const bestDistance = Math.max(currentStats.totalDistance, localDistanceRef.current);
      const bestTopSpeed = Math.max(currentStats.topSpeed, localTopSpeedRef.current);
      const bestAvgSpeed = elapsedSeconds > 0 && bestDistance > 0
        ? (bestDistance / elapsedSeconds) * 3600 // km/s → km/h
        : currentStats.avgSpeed;

      dispatch(setStats({
        totalDistance: bestDistance,
        totalTime: elapsedSeconds,
        movingTime: currentStats.movingTime || elapsedSeconds, // fallback to elapsed if smart tracking not running
        avgSpeed: bestAvgSpeed,
        topSpeed: bestTopSpeed,
        currentSpeed: currentSpeedRef.current,
        activeMembersCount: membersRef.current.filter(m => m.isOnline).length,
        completedMembersCount: Object.values(memberInstancesRef.current).filter(inst => inst.status === 'COMPLETED').length,
      }));

      // Update live notification every 3 seconds (Android foreground / iOS Live Activity)
      if (now - lastNotificationUpdateRef.current >= 3000) {
        lastNotificationUpdateRef.current = now;
        const journey = currentJourneyRef.current;
        if (journey) {
          const notifData: JourneyNotificationData = {
            journeyId: journey.id,
            startTime: startTime,
            totalDistance: bestDistance,
            currentSpeed: currentSpeedRef.current,
            avgSpeed: bestAvgSpeed,
            topSpeed: bestTopSpeed,
            movingTime: currentStats.movingTime || elapsedSeconds,
            progress: 0,
            startLocationName: journey.startLocation?.address || 'Start',
            destinationName: journey.endLocation?.address || 'Group Ride',
          };
          LiveNotificationService.updateNotification(notifData).catch(() => {});
        }
      }
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(interval);
  }, [isInstanceActive, dispatch]);

  const setMyInstance = useCallback((nextValue: JourneyInstance | null | ((prev: JourneyInstance | null) => JourneyInstance | null)) => {
    const resolved = typeof nextValue === 'function' ? nextValue(myInstanceRef.current) : nextValue;
    dispatch(setMyInstanceState(resolved ?? null));
  }, [dispatch]);

  const memberLocations = useMemo(() => {
    const memberMap = members.reduce<Record<string, typeof members[number]>>((acc, member) => {
      acc[member.id] = member;
      return acc;
    }, {});

    const ids = new Set<string>();
    members.forEach(member => ids.add(member.id));
    Object.keys(journeyState.memberInstances).forEach(id => ids.add(id));
    Object.keys(memberLocationsMap).forEach(id => ids.add(id));

    return Array.from(ids)
      .filter(Boolean)
      .map(userId => {
        const instance = journeyState.memberInstances[userId];
        const location = memberLocationsMap[userId];
        const member = memberMap[userId];

        return {
          instanceId: instance?.id || `member-${userId}`,
          userId,
          displayName: member?.displayName || instance?.displayName || 'Member',
          photoURL: member?.photoURL || instance?.photoURL,
          latitude: location?.latitude,
          longitude: location?.longitude,
          status: instance?.status || 'ACTIVE',
          totalDistance: instance?.totalDistance,
          totalTime: instance?.totalTime,
          speed: location?.speed,
          heading: location?.heading,
          lastUpdate: instance?.lastUpdate || (location?.timestamp
            ? (typeof location.timestamp === 'number'
              ? new Date(location.timestamp).toISOString()
              : String(location.timestamp))
            : undefined),
        } as MemberLocation;
      })
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }, [members, journeyState.memberInstances, memberLocationsMap]);

  const joinGroupJourney = useCallback(
    (journeyId?: string) => {
      if (!socket || !socket.connected) return;
      const targetId = journeyId || groupJourneyId;
      if (!targetId) return;
      socket.emit('group-journey:join', { groupJourneyId: targetId });
    },
    [socket, groupJourneyId],
  );

  const leaveGroupJourney = useCallback(() => {
    if (!socket || !groupJourneyId) return;
    socket.emit('group-journey:leave', { groupJourneyId });
    setIsJoined(false);
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    dispatch(hydrateMembersFromSnapshot([]));
    dispatch(setGroupTracking({ isTracking: false, instanceId: null }));
  }, [socket, groupJourneyId, dispatch]);

  const requestState = useCallback(() => {
    if (!socket || !groupJourneyId) return;
    socket.emit('group-journey:request-state', { groupJourneyId });
  }, [socket, groupJourneyId]);

  const startLocationTracking = useCallback(
    async (instanceId: string) => {
      if (!socket || groupTracking.isTracking) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required', 'Enable location sharing to join the group journey.');
        return;
      }

      dispatch(setGroupTracking({ isTracking: true, instanceId }));

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: LOCATION_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_METERS,
        },
        location => {
          const now = Date.now();
          if (now - lastEmitRef.current < LOCATION_INTERVAL_MS) return;
          lastEmitRef.current = now;

          const { latitude, longitude, speed, heading, accuracy } = location.coords;
          // Store current speed (m/s -> km/h) for stats display
          const speedKmh = (speed ?? 0) > 0 ? (speed ?? 0) * 3.6 : 0;
          currentSpeedRef.current = speedKmh;

          // Local Haversine distance accumulation (fallback for Android)
          if ((accuracy ?? 999) <= MIN_ACCURACY_FOR_DISTANCE) {
            const prev = lastLocationForDistanceRef.current;
            if (prev) {
              const segmentKm = haversineKm(prev.latitude, prev.longitude, latitude, longitude);
              // Only add meaningful movement (>5m) to avoid GPS jitter
              if (segmentKm > 0.005 && segmentKm < 1.0) {
                localDistanceRef.current += segmentKm;
              }
            }
            lastLocationForDistanceRef.current = { latitude, longitude };
          }
          // Track local top speed
          if (speedKmh > localTopSpeedRef.current && speedKmh < 250) {
            localTopSpeedRef.current = speedKmh;
          }

          const userId = myInstanceRef.current?.userId;
          if (!socket?.connected) return;
          // Include best distance so other members see real stats
          const currentDistance = Math.max(
            statsRef.current?.totalDistance || 0,
            localDistanceRef.current,
          );
          socket.emit('instance:location-update', {
            instanceId,
            latitude,
            longitude,
            speed: speed ?? 0,
            heading: heading ?? 0,
            totalDistance: currentDistance,
            timestamp: new Date().toISOString(),
          });

          setMyInstance(prev =>
            prev
              ? {
                  ...prev,
                  currentLatitude: latitude,
                  currentLongitude: longitude,
                }
              : prev,
          );
          if (userId) {
            dispatch(mergeMemberLocation({
              userId,
              instanceId,
              latitude,
              longitude,
              speed: speed ?? undefined,
              heading: heading ?? undefined,
              lastUpdate: new Date().toISOString(),
            }));
          }
        },
      );

      locationSubscriptionRef.current = subscription;
    },
    [socket, groupTracking.isTracking, dispatch, setMyInstance],
  );

  const stopLocationTracking = useCallback(() => {
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
    clientStartTimeRef.current = null;
    currentSpeedRef.current = 0;
    localDistanceRef.current = 0;
    lastLocationForDistanceRef.current = null;
    localTopSpeedRef.current = 0;
    dispatch(setGroupTracking({ isTracking: false, instanceId: null }));
  }, [dispatch]);

  useEffect(() => {
    if (!socket) return;

    const handleJourneyStarted = (data: any) => {
      Alert.alert('Journey started', `${data.title} is live`, [
        {
          text: 'Open journey',
          onPress: () =>
            router.push({
              pathname: '/group-journey',
              params: { groupJourneyId: data.groupJourneyId },
            }),
        },
        { text: 'Later', style: 'cancel' },
      ]);
    };

    const handleJoined = (data: any) => {
      setIsJoined(true);
      if (Array.isArray(data?.memberLocations)) {
        dispatch(hydrateMembersFromSnapshot(data.memberLocations));
      }
      if (data?.groupJourney) {
        dispatch(setGroupJourneyState(data.groupJourney));
      }
    };

    const handleState = (data: any) => {
      if (Array.isArray(data?.members)) {
        dispatch(hydrateMembersFromSnapshot(data.members));
      }
    };

    const handleMemberLocation = (payload: Partial<MemberLocation>) => {
      if (!payload.userId) return;
      dispatch(mergeMemberLocation({
        userId: payload.userId,
        instanceId: payload.instanceId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        totalDistance: payload.totalDistance,
        totalTime: payload.totalTime,
        speed: payload.speed,
        heading: payload.heading,
        status: payload.status,
        displayName: payload.displayName,
        photoURL: payload.photoURL,
        lastUpdate: payload.lastUpdate,
      }));

      // Update myInstance totalDistance from server when this is our own location update
      const current = myInstanceRef.current;
      if (current && payload.instanceId === current.id && payload.totalDistance !== undefined) {
        setMyInstance(prev =>
          prev ? { ...prev, totalDistance: payload.totalDistance } : prev,
        );
      }
    };

    const handleMemberStatus = (payload: Partial<MemberLocation> & { userId: string; status: MemberLocation['status'] }) => {
      dispatch(mergeMemberLocation({
        userId: payload.userId,
        instanceId: payload.instanceId,
        status: payload.status,
        totalDistance: payload.totalDistance,
        totalTime: payload.totalTime,
        displayName: payload.displayName,
        photoURL: payload.photoURL,
        lastUpdate: payload.lastUpdate,
      }));
    };

    const handleReconnect = () => {
      joinGroupJourney();
      requestState();
    };

    socket.on('group-journey:started', handleJourneyStarted);
    socket.on('group-journey:joined', handleJoined);
    socket.on('group-journey:state', handleState);
    socket.on('member:location-updated', handleMemberLocation);
    socket.on('member:journey-paused', handleMemberStatus);
    socket.on('member:journey-resumed', handleMemberStatus);
    socket.on('member:journey-completed', handleMemberStatus);
    socket.io?.on('reconnect', handleReconnect);

    return () => {
      socket.off('group-journey:started', handleJourneyStarted);
      socket.off('group-journey:joined', handleJoined);
      socket.off('group-journey:state', handleState);
      socket.off('member:location-updated', handleMemberLocation);
      socket.off('member:journey-paused', handleMemberStatus);
      socket.off('member:journey-resumed', handleMemberStatus);
      socket.off('member:journey-completed', handleMemberStatus);
      socket.io?.off('reconnect', handleReconnect);
    };
  }, [socket, joinGroupJourney, requestState, router, dispatch]);

  useEffect(() => {
    if (autoStart) {
      joinGroupJourney();
      requestState();
    }
  }, [autoStart, joinGroupJourney, requestState]);

  useEffect(() => () => {
    stopLocationTracking();
    leaveGroupJourney();
  }, [leaveGroupJourney, stopLocationTracking]);

  return {
    isJoined,
    memberLocations,
    myInstance,
    groupJourney,
    isTracking: groupTracking.isTracking,
    joinGroupJourney,
    leaveGroupJourney,
    startLocationTracking,
    stopLocationTracking,
    requestState,
    setMyInstance,
  };
};
