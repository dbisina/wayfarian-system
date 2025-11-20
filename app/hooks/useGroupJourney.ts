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
} from '../store/slices/journeySlice';
import type { JourneyInstance } from '../store/slices/journeySlice';
import {
  useGroupTracking,
  useJourneyMembers,
  useJourneyState,
  useJourneyLocations,
} from './useJourneyState';

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

  useEffect(() => {
    myInstanceRef.current = myInstance;
    if (myInstance) {
      dispatch(setStats({
        totalDistance: myInstance.totalDistance || 0,
        totalTime: myInstance.totalTime || 0,
        activeMembersCount: members.filter(m => m.isOnline).length,
        completedMembersCount: members.filter(m => m.status === 'COMPLETED').length,
      }));
    }
  }, [myInstance, dispatch, members]);

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
          lastUpdate: instance?.lastUpdate || (location?.timestamp ? location.timestamp.toISOString() : undefined),
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

          const { latitude, longitude, speed, heading } = location.coords;
          const userId = myInstanceRef.current?.userId;
          socket.emit('instance:location-update', {
            instanceId,
            latitude,
            longitude,
            speed: speed ?? 0,
            heading: heading ?? 0,
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
