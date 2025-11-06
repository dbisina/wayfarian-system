// app/hooks/useGroupJourney.ts
// Custom hook for group journey real-time coordination

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Socket } from 'socket.io-client';
import { Alert } from 'react-native';
import * as Location from 'expo-location';

export interface MemberLocation {
  instanceId: string;
  userId: string;
  displayName: string;
  photoURL?: string;
  latitude: number;
  longitude: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  totalDistance: number;
  totalTime: number;
  speed?: number;
  heading?: number;
  lastUpdate?: string;
}

export interface GroupJourney {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  completedAt?: string;
  startLatitude: number;
  startLongitude: number;
  endLatitude?: number;
  endLongitude?: number;
  instances: any[];
  members: any[];
}

export interface JourneyInstance {
  id: string;
  userId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string;
  totalDistance: number;
  totalTime: number;
  avgSpeed: number;
  topSpeed: number;
  currentLatitude?: number;
  currentLongitude?: number;
  lastLocationUpdate?: string;
}

interface UseGroupJourneyProps {
  socket: Socket | null;
  groupJourneyId?: string;
  autoStart?: boolean;
}

export const useGroupJourney = ({ socket, groupJourneyId, autoStart = false }: UseGroupJourneyProps) => {
  const router = useRouter();
  const [isJoined, setIsJoined] = useState(false);
  const [memberLocations, setMemberLocations] = useState<MemberLocation[]>([]);
  const [myInstance, setMyInstance] = useState<JourneyInstance | null>(null);
  const [groupJourney, setGroupJourney] = useState<GroupJourney | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const UPDATE_THROTTLE = 3000; // Send location updates every 3 seconds

  /**
   * Join group journey room for real-time updates
   */
  const joinGroupJourney = useCallback((journeyId: string) => {
    if (!socket || !socket.connected) {
      console.error('Socket not connected');
      return;
    }

    socket.emit('group-journey:join', { groupJourneyId: journeyId });
  }, [socket]);

  /**
   * Leave group journey room
   */
  const leaveGroupJourney = useCallback(() => {
    if (!socket || !groupJourneyId) return;
    
    socket.emit('group-journey:leave', { groupJourneyId });
    setIsJoined(false);
  }, [socket, groupJourneyId]);

  /**
   * Start location tracking for this instance
   */
  const startLocationTracking = useCallback(async (instanceId: string) => {
    if (!socket || isTracking) return;

    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for group journeys');
        return;
      }

      setIsTracking(true);

      // Start watching location
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 10, // Update every 10 meters
        },
        (location) => {
          const now = Date.now();
          
          // Throttle updates to avoid overwhelming the server
          if (now - lastUpdateRef.current < UPDATE_THROTTLE) {
            return;
          }

          lastUpdateRef.current = now;

          const { latitude, longitude, speed, heading } = location.coords;

          // Emit location update via socket
          socket.emit('instance:location-update', {
            instanceId,
            latitude,
            longitude,
            speed: speed || 0,
            heading: heading || 0,
            timestamp: new Date().toISOString(),
          });

          // Update local state
          setMyInstance(prev => prev ? {
            ...prev,
            currentLatitude: latitude,
            currentLongitude: longitude,
          } : null);
        }
      );

      locationSubscriptionRef.current = subscription;
    } catch (error) {
      console.error('Location tracking error:', error);
      Alert.alert('Error', 'Failed to start location tracking');
      setIsTracking(false);
    }
  }, [socket, isTracking]);

  /**
   * Stop location tracking
   */
  const stopLocationTracking = useCallback(() => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
    setIsTracking(false);
  }, []);

  /**
   * Request current state of all participants
   */
  const requestState = useCallback(() => {
    if (!socket || !groupJourneyId) return;
    socket.emit('group-journey:request-state', { groupJourneyId });
  }, [socket, groupJourneyId]);

  /**
   * Socket event listeners
   */
  useEffect(() => {
    if (!socket) return;

    // Auto-navigate when journey starts
    const handleJourneyStarted = (data: any) => {
      console.log('🚀 Group journey started:', data);
      
      Alert.alert(
        'Journey Started!',
        `${data.title} has begun. Get ready to ride!`,
        [
          {
            text: 'Join Journey',
            onPress: () => {
              router.push({ pathname: '/journey', params: { groupId: data.groupId, groupJourneyId: data.groupJourneyId } });
            },
          },
          {
            text: 'Later',
            style: 'cancel',
          },
        ]
      );
    };

    // Successfully joined journey room
    const handleJourneyJoined = (data: any) => {
      console.log('✅ Joined group journey:', data);
      setIsJoined(true);
      setMemberLocations(data.memberLocations || []);
    };

    // Member location updated
    const handleLocationUpdated = (data: MemberLocation) => {
      setMemberLocations(prev => {
        const existing = prev.find(m => m.userId === data.userId);
        if (existing) {
          return prev.map(m => m.userId === data.userId ? { ...m, ...data } : m);
        } else {
          return [...prev, data];
        }
      });
    };

    // Member completed their journey
    const handleMemberCompleted = (data: any) => {
      console.log('🏁 Member completed:', data.user.displayName);
      
      // Update member status
      setMemberLocations(prev =>
        prev.map(m =>
          m.userId === data.userId
            ? { ...m, status: 'COMPLETED' as const }
            : m
        )
      );

      // Show notification
      Alert.alert(
        '🏁 Member Finished!',
        `${data.user.displayName} completed the journey!\n\nDistance: ${(data.stats.totalDistance / 1000).toFixed(2)} km\nTime: ${Math.floor(data.stats.totalTime / 60)} min`,
        [{ text: 'Nice!', style: 'default' }]
      );

      if (data.allCompleted) {
        Alert.alert(
          '🎉 Journey Complete!',
          'All members have finished the journey!',
          [{ text: 'Awesome!', style: 'default' }]
        );
      }
    };

    // Member paused
    const handleMemberPaused = (data: any) => {
      setMemberLocations(prev =>
        prev.map(m =>
          m.userId === data.userId
            ? { ...m, status: 'PAUSED' as const }
            : m
        )
      );
    };

    // Member resumed
    const handleMemberResumed = (data: any) => {
      setMemberLocations(prev =>
        prev.map(m =>
          m.userId === data.userId
            ? { ...m, status: 'ACTIVE' as const }
            : m
        )
      );
    };

    // Member connected
    const handleMemberConnected = (data: any) => {
      console.log('👋 Member connected:', data.displayName);
    };

    // Member disconnected
    const handleMemberDisconnected = (data: any) => {
      console.log('👋 Member disconnected:', data.userId);
    };

    // Full state update
    const handleState = (data: any) => {
      setMemberLocations(data.members || []);
    };

    // Register listeners
    socket.on('group-journey:started', handleJourneyStarted);
    socket.on('group-journey:joined', handleJourneyJoined);
    socket.on('member:location-updated', handleLocationUpdated);
    socket.on('member:journey-completed', handleMemberCompleted);
    socket.on('member:journey-paused', handleMemberPaused);
    socket.on('member:journey-resumed', handleMemberResumed);
    socket.on('member:connected', handleMemberConnected);
    socket.on('member:disconnected', handleMemberDisconnected);
    socket.on('group-journey:state', handleState);

    return () => {
      socket.off('group-journey:started', handleJourneyStarted);
      socket.off('group-journey:joined', handleJourneyJoined);
      socket.off('member:location-updated', handleLocationUpdated);
      socket.off('member:journey-completed', handleMemberCompleted);
      socket.off('member:journey-paused', handleMemberPaused);
      socket.off('member:journey-resumed', handleMemberResumed);
      socket.off('member:connected', handleMemberConnected);
      socket.off('member:disconnected', handleMemberDisconnected);
      socket.off('group-journey:state', handleState);
    };
  }, [socket, router]);

  /**
   * Auto-join on mount if groupJourneyId provided
   */
  useEffect(() => {
    if (autoStart && groupJourneyId && socket && socket.connected && !isJoined) {
      joinGroupJourney(groupJourneyId);
    }
  }, [autoStart, groupJourneyId, socket, isJoined, joinGroupJourney]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopLocationTracking();
      if (isJoined) {
        leaveGroupJourney();
      }
    };
  }, [isJoined, leaveGroupJourney, stopLocationTracking]);

  return {
    isJoined,
    memberLocations,
    myInstance,
    groupJourney,
    isTracking,
    joinGroupJourney,
    leaveGroupJourney,
    startLocationTracking,
    stopLocationTracking,
    requestState,
    setMyInstance,
    setGroupJourney,
  };
};
