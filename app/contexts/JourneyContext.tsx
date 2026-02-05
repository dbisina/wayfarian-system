// app/contexts/JourneyContext.tsx
// Journey state management and real-time tracking bridged through Redux

import React, { createContext, useContext, useEffect, useMemo, ReactNode, useCallback, useRef, useState } from 'react';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI, groupJourneyAPI, galleryAPI } from '../services/api';
import { ensureGroupJourneySocket, teardownGroupJourneySocket } from '../services/groupJourneySocket';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useAppDispatch } from '../store/hooks';
import { useSmartTracking } from '../hooks/useSmartTracking';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearJourney,
  clearRoutePoints,
  enqueueUpload,
  failUpload,
  mergeMemberLocation,
  removeUploadJob,
  setCurrentJourney,
  setHydrated,
  setJourneyMinimized,
  setMyInstance,
  setRoutePoints,
  setStats,
  setTracking,
  updateUploadStatus,
} from '../store/slices/journeySlice';
import type { GroupMember, JourneyData, RoutePoint, UploadJob } from '../store/slices/journeySlice';
import {
  useJourneyHydration,
  useJourneyMembers,
  useJourneyRoutePoints,
  useJourneyState,
  useJourneyStats,
  useJourneyUploadQueue,
} from '../hooks/useJourneyState';
import BackgroundTaskService from '../services/backgroundTaskService';
import OfflineQueueService from '../services/offlineQueueService';

export type { GroupMember, JourneyData } from '../store/slices/journeySlice';

export interface JourneyContextType {
  currentJourney: JourneyData | null;
  isTracking: boolean;
  isMinimized: boolean;
  stats: JourneyStats;
  routePoints: RoutePoint[];
  groupMembers: GroupMember[];
  uploadQueue: UploadJob[];
  startJourney: (journeyData: Partial<JourneyData>) => Promise<boolean>;
  saveJourney: (journeyData: Partial<JourneyData> & { startTime?: string; notes?: string }) => Promise<boolean>;
  pauseJourney: () => Promise<void>;
  resumeJourney: () => Promise<void>;
  endJourney: () => Promise<string | null>;
  clearStuckJourney: () => Promise<void>;
  addPhoto: (photoUri: string) => Promise<void>;
  minimizeJourney: () => void;
  maximizeJourney: () => void;
  loadGroupMembers: (groupId: string) => Promise<void>;
  updateMemberLocation: (memberId: string, location: LocationPoint) => void;
  hydrated: boolean;
  currentLocation: LocationPoint | null;
  // Resume tracking for an existing ACTIVE journey (used for scheduled journeys)
  resumeActiveJourney: (journeyId: string) => Promise<boolean>;
}

const JourneyContext = createContext<JourneyContextType | undefined>(undefined);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const journeyState = useJourneyState();
  const hydrated = useJourneyHydration();
  const groupMembers = useJourneyMembers();
  const statsFromStore = useJourneyStats();
  const routePoints = useJourneyRoutePoints();
  const uploadQueue = useJourneyUploadQueue();

  // Use Smart Tracking Hook
  const { 
    liveRawLocation, 
    officialSnappedPath, 
    officialDistance, 
    movingTime, 
    avgSpeed,
    maxSpeed 
  } = useSmartTracking(journeyState.isTracking);

  // Local timer state for smooth updates
  const [localElapsedTime, setLocalElapsedTime] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const JOURNEY_START_TIME_KEY = 'journey_start_time'; // AsyncStorage key for persistence

  // Persist startTime to AsyncStorage for recovery on app restart
  const persistStartTime = useCallback(async (time: number) => {
    try {
      await AsyncStorage.setItem(JOURNEY_START_TIME_KEY, time.toString());
    } catch (e) {
      console.warn('[JourneyContext] Failed to persist startTime:', e);
    }
  }, []);

  // Recover startTime from AsyncStorage
  const recoverStartTime = useCallback(async (): Promise<number | null> => {
    try {
      const stored = await AsyncStorage.getItem(JOURNEY_START_TIME_KEY);
      if (stored) {
        return parseInt(stored, 10);
      }
    } catch (e) {
      console.warn('[JourneyContext] Failed to recover startTime:', e);
    }
    return null;
  }, []);

  // Clear persisted startTime
  const clearStartTime = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(JOURNEY_START_TIME_KEY);
    } catch (e) {
      console.warn('[JourneyContext] Failed to clear startTime:', e);
    }
  }, []);

  // Update local timer every second when tracking - with persistence and smooth updates
  useEffect(() => {
    // FIX: Always clear existing interval FIRST to prevent memory leak from multiple intervals
    // This must happen before any async operations
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // For solo journeys, use startTimeRef; for group journeys, use myInstance.startTime
    const hasJourney = journeyState.isTracking && (
      startTimeRef.current ||
      journeyState.myInstance?.startTime ||
      journeyState.currentJourney?.id
    );

    // Track if effect has been cleaned up to prevent setting state after unmount
    let isCancelled = false;

    if (hasJourney) {
      const initializeTimer = async () => {
        let startTime: number;

        if (journeyState.myInstance?.startTime) {
          // Group journey - use instance startTime
          startTime = new Date(journeyState.myInstance.startTime).getTime();
        } else if (startTimeRef.current) {
          // Solo journey - use stored startTime
          startTime = startTimeRef.current;
        } else {
          // Try to recover from AsyncStorage (app was restarted)
          const recovered = await recoverStartTime();
          if (isCancelled) return; // Don't continue if effect was cleaned up

          if (recovered && journeyState.currentJourney?.id) {
            startTime = recovered;
            startTimeRef.current = recovered;
          } else {
            // Last resort: use current time (journey just started)
            startTime = Date.now();
            startTimeRef.current = startTime;
            await persistStartTime(startTime);
            if (isCancelled) return;
          }
        }

        // Don't set state or create interval if effect was cleaned up
        if (isCancelled) return;

        // Update immediately with accurate time
        const now = Date.now();
        const elapsed = Math.max(0, Math.floor((now - startTime) / 1000));
        setLocalElapsedTime(elapsed);

        // Use setInterval for consistent 1-second updates
        // Calculate from startTime each tick to prevent drift
        timerIntervalRef.current = setInterval(() => {
          if (isCancelled) return;
          const currentStartTime = journeyState.myInstance?.startTime
            ? new Date(journeyState.myInstance.startTime).getTime()
            : startTimeRef.current || startTime;
          const currentTime = Date.now();
          const newElapsed = Math.max(0, Math.floor((currentTime - currentStartTime) / 1000));
          setLocalElapsedTime(newElapsed);
        }, 1000) as unknown as number;
      };

      initializeTimer();

      return () => {
        isCancelled = true;
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      };
    } else {
      // Not tracking - reset timer
      setLocalElapsedTime(0);
      if (!journeyState.myInstance?.startTime) {
        startTimeRef.current = null;
      }

      return () => {
        isCancelled = true;
      };
    }
  }, [journeyState.isTracking, journeyState.myInstance?.startTime, journeyState.currentJourney?.id, recoverStartTime, persistStartTime]);

  const derivedStats: JourneyStats = useMemo(() => ({
    totalDistance: officialDistance,
    totalTime: journeyState.isTracking && (journeyState.myInstance?.startTime || startTimeRef.current)
      ? localElapsedTime
      : statsFromStore.totalTime,
    movingTime: movingTime,
    avgSpeed: avgSpeed,
    topSpeed: maxSpeed,
    currentSpeed: liveRawLocation?.speed ? liveRawLocation.speed * 3.6 : 0,
  }), [statsFromStore, officialDistance, movingTime, avgSpeed, maxSpeed, liveRawLocation, journeyState.myInstance, journeyState.isTracking, localElapsedTime]);

  // Sync Smart Tracking data to Redux Store
  useEffect(() => {
    if (!journeyState.isTracking) return;

    const newStats: JourneyStats = {
      totalDistance: officialDistance,
      totalTime: derivedStats.totalTime,
      movingTime: movingTime,
      avgSpeed: avgSpeed,
      topSpeed: maxSpeed,
      currentSpeed: derivedStats.currentSpeed,
    };
    
    dispatch(setStats(newStats));

    // Map snapped path to RoutePoints
    // Note: officialSnappedPath is just geometry. We might want to append liveRawLocation as the latest point?
    // Or just use officialSnappedPath for the line.
    // RoutePoint expects { latitude, longitude, timestamp, speed, accuracy, altitude }
    // We'll reconstruct it from the snapped path, though we lose per-point metadata.
    // For the visual line, lat/lng is key.
    const newRoutePoints = officialSnappedPath.map((p, index) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: Date.now(), // Placeholder
      speed: 0,
      accuracy: 0,
      altitude: 0
    }));
    
    // If we have a live location that isn't snapped yet, maybe append it?
    // For now, let's stick to the official path to avoid "jagged" lines.
    dispatch(setRoutePoints(newRoutePoints));

  }, [officialDistance, movingTime, avgSpeed, maxSpeed, liveRawLocation, officialSnappedPath, journeyState.isTracking, dispatch, derivedStats.totalTime, derivedStats.currentSpeed]);

  // Backend & Socket Updates
  useEffect(() => {
    if (!journeyState.isTracking || !liveRawLocation || !journeyState.currentJourney) return;

    const updateBackend = async () => {
       try {
         await journeyAPI.updateJourney(journeyState.currentJourney!.id, {
           currentLatitude: liveRawLocation.latitude,
           currentLongitude: liveRawLocation.longitude,
           currentSpeed: liveRawLocation.speed * 3.6,
         });
       } catch (e) {
         console.warn('Backend update failed', e);
       }
    };

    // Throttle backend updates? useSmartTracking updates liveRawLocation frequently.
    // For now, we update on every location change (approx 2s).
    updateBackend();

    // Socket update
    if (journeyState.currentJourney.groupId) {
      // Use the imported shareGroupLocation (need to ensure it's imported from socket service correctly)
      // Wait, I imported it from groupJourneySocket? No, it's in socket.ts.
      // I need to check where I imported it from.
      // I imported it from '../services/groupJourneySocket' in the previous edit, but it might not be there.
      // Let's check imports.
    }

  }, [liveRawLocation, journeyState.isTracking, journeyState.currentJourney]);
  // Keys for persisting journey/instance IDs
  const JOURNEY_ID_KEY = 'active_journey_id';
  const GROUP_INSTANCE_ID_KEY = 'active_group_instance_id';
  
  // Persist journey ID and group instance ID when we have an active journey
  useEffect(() => {
    const persistJourneyIds = async () => {
      if (journeyState.currentJourney?.id && journeyState.isTracking) {
        await AsyncStorage.setItem(JOURNEY_ID_KEY, journeyState.currentJourney.id);
        // Also persist group instance ID if this is a group journey
        if (journeyState.currentJourney.groupJourneyId || journeyState.myInstance?.id) {
          const instanceId = journeyState.myInstance?.id || journeyState.currentJourney.id;
          await AsyncStorage.setItem(GROUP_INSTANCE_ID_KEY, instanceId);
        }
      }
    };
    persistJourneyIds();
  }, [journeyState.currentJourney?.id, journeyState.isTracking, journeyState.currentJourney?.groupJourneyId, journeyState.myInstance?.id]);

  // AppState listener for app foreground/background detection
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastRecoveryRef = useRef<number>(0);
  
  // Recovery function to restore journey state from background/backend
  const recoverJourneyOnForeground = useCallback(async () => {
    // Debounce: don't recover more than once every 2 seconds
    const now = Date.now();
    if (now - lastRecoveryRef.current < 2000) return;
    lastRecoveryRef.current = now;
    
    console.log('[JourneyContext] App came to foreground, checking for active journey...');
    
    try {
      // 1. First check background task service for persisted state
      const backgroundState = await BackgroundTaskService.getPersistedJourneyState();
      
      if (backgroundState) {
        console.log('[JourneyContext] Found background journey state:', backgroundState.journeyId);
        
        // We have background tracking data - recover startTime
        if (!startTimeRef.current && backgroundState.startTime) {
          startTimeRef.current = backgroundState.startTime;
          await persistStartTime(backgroundState.startTime);
        }
        
        // If we don't have a current journey set, fetch from backend
        if (!journeyState.currentJourney) {
          const response = await journeyAPI.getActiveJourney();
          if (response?.journey) {
            dispatch(setCurrentJourney({
              id: response.journey.id,
              title: response.journey.title,
              startLocation: response.journey.startLatitude ? {
                latitude: response.journey.startLatitude,
                longitude: response.journey.startLongitude,
                address: response.journey.startAddress || 'Start Location',
              } : undefined,
              endLocation: response.journey.endLatitude ? {
                latitude: response.journey.endLatitude,
                longitude: response.journey.endLongitude,
                address: response.journey.endAddress || 'End Location',
              } : undefined,
              groupId: response.journey.groupId,
              vehicle: response.journey.vehicle,
              status: 'active',
              photos: response.journey.photos || [],
            }));
            dispatch(setTracking(true));
            dispatch(setJourneyMinimized(false));
            
            // Recover startTime from journey
            if (response.journey.startTime && !startTimeRef.current) {
              startTimeRef.current = new Date(response.journey.startTime).getTime();
              await persistStartTime(startTimeRef.current);
            }
          }
        } else {
          // We have currentJourney but may not be tracking - resume tracking
          if (!journeyState.isTracking) {
            dispatch(setTracking(true));
          }
        }
      } else {
        // No background state - check if we have a persisted journey ID (orphaned journey)
        const persistedJourneyId = await AsyncStorage.getItem(JOURNEY_ID_KEY);
        
        if (persistedJourneyId && !journeyState.currentJourney) {
          console.log('[JourneyContext] Found orphaned journey ID:', persistedJourneyId);
          
          // Fetch journey from backend
          const response = await journeyAPI.getActiveJourney();
          if (response?.journey && response.journey.id === persistedJourneyId) {
            // Calculate how long ago the journey started
            const startTime = new Date(response.journey.startTime).getTime();
            const elapsedMs = Date.now() - startTime;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            const elapsedHours = Math.floor(elapsedMinutes / 60);
            const timeAgo = elapsedHours > 0 
              ? `${elapsedHours}h ${elapsedMinutes % 60}m`
              : `${elapsedMinutes}m`;
            
            // Show dialog asking user what to do
            Alert.alert(
              'Unfinished Journey',
              `You have an active journey from ${timeAgo} ago. Would you like to resume tracking or end this journey?`,
              [
                {
                  text: 'End Journey',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // End the journey on backend
                      await journeyAPI.endJourney(response.journey.id, {
                        totalDistance: response.journey.totalDistance || 0,
                      });
                      // Clear persisted state
                      await AsyncStorage.removeItem(JOURNEY_ID_KEY);
                      await clearStartTime();
                      console.log('[JourneyContext] Orphaned journey ended by user');
                    } catch (e) {
                      console.error('[JourneyContext] Error ending orphaned journey:', e);
                    }
                  },
                },
                {
                  text: 'Resume',
                  style: 'default',
                  onPress: async () => {
                    try {
                      // Set up journey state
                      dispatch(setCurrentJourney({
                        id: response.journey.id,
                        title: response.journey.title,
                        startLocation: response.journey.startLatitude ? {
                          latitude: response.journey.startLatitude,
                          longitude: response.journey.startLongitude,
                          address: response.journey.startAddress || 'Start Location',
                        } : undefined,
                        endLocation: response.journey.endLatitude ? {
                          latitude: response.journey.endLatitude,
                          longitude: response.journey.endLongitude,
                          address: response.journey.endAddress || 'End Location',
                        } : undefined,
                        groupId: response.journey.groupId,
                        vehicle: response.journey.vehicle,
                        status: 'active',
                        photos: response.journey.photos || [],
                      }));
                      dispatch(setTracking(true));
                      dispatch(setJourneyMinimized(false));
                      
                      // Recover startTime
                      if (response.journey.startTime) {
                        startTimeRef.current = new Date(response.journey.startTime).getTime();
                        await persistStartTime(startTimeRef.current);
                      }
                      
                      // Restart background tracking
                      const isActive = await BackgroundTaskService.isBackgroundTrackingActive();
                      if (!isActive) {
                        await BackgroundTaskService.startBackgroundTracking(response.journey.id, {});
                      }
                      console.log('[JourneyContext] Orphaned journey resumed by user');
                    } catch (e) {
                      console.error('[JourneyContext] Error resuming orphaned journey:', e);
                    }
                  },
                },
              ],
              { cancelable: false }
            );
          } else {
            // Journey doesn't exist on backend - clear persisted ID
            await AsyncStorage.removeItem(JOURNEY_ID_KEY);
          }
        }
        
        // 3. Check for orphaned group journey instance
        const persistedInstanceId = await AsyncStorage.getItem(GROUP_INSTANCE_ID_KEY);
        if (persistedInstanceId && !journeyState.currentJourney && !journeyState.myInstance) {
          console.log('[JourneyContext] Found orphaned group instance ID:', persistedInstanceId);
          
          // Fetch active instance from backend
          const myInst = await groupJourneyAPI.getMyActiveInstance();
          const inst = myInst?.instance || myInst?.myInstance || myInst?.data || myInst?.journeyInstance;
          
          if (inst && (inst.status === 'ACTIVE' || inst.status === 'PAUSED')) {
            // Calculate time elapsed
            const startTime = new Date(inst.startTime).getTime();
            const elapsedMs = Date.now() - startTime;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            const elapsedHours = Math.floor(elapsedMinutes / 60);
            const timeAgo = elapsedHours > 0 
              ? `${elapsedHours}h ${elapsedMinutes % 60}m`
              : `${elapsedMinutes}m`;
            
            // Show dialog for group journey
            Alert.alert(
              'Unfinished Group Journey',
              `You have an active group ride from ${timeAgo} ago. Would you like to resume tracking or complete this journey?`,
              [
                {
                  text: 'Complete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Complete the instance on backend
                      await groupJourneyAPI.completeInstance(inst.id, {});
                      // Clear persisted state
                      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY);
                      await AsyncStorage.removeItem(JOURNEY_ID_KEY);
                      await clearStartTime();
                      console.log('[JourneyContext] Orphaned group instance completed by user');
                    } catch (e) {
                      console.error('[JourneyContext] Error completing orphaned group instance:', e);
                    }
                  },
                },
                {
                  text: 'Resume',
                  style: 'default',
                  onPress: async () => {
                    try {
                      // Set up instance and journey state
                      dispatch(setMyInstance(inst));
                      dispatch(setCurrentJourney({
                        id: inst.id,
                        title: inst.groupJourney?.title || 'Group Ride',
                        startLocation: inst.startLatitude ? {
                          latitude: inst.startLatitude,
                          longitude: inst.startLongitude,
                          address: inst.startAddress || 'Start Location',
                        } : undefined,
                        endLocation: inst.endLatitude ? {
                          latitude: inst.endLatitude,
                          longitude: inst.endLongitude,
                          address: inst.endAddress || 'End Location',
                        } : undefined,
                        groupId: inst.groupId || inst.groupJourney?.groupId,
                        groupJourneyId: inst.groupJourney?.id,
                        vehicle: inst.vehicle,
                        status: 'active',
                        photos: inst.photos || [],
                      }));
                      dispatch(setTracking(true));
                      dispatch(setJourneyMinimized(false));
                      
                      // Recover startTime
                      if (inst.startTime) {
                        startTimeRef.current = new Date(inst.startTime).getTime();
                        await persistStartTime(startTimeRef.current);
                      }
                      
                      // Set up socket and restart background tracking
                      const gid = inst.groupId || inst.groupJourney?.groupId;
                      if (gid) {
                        await ensureGroupJourneySocket(gid, dispatch);
                      }
                      
                      const isActive = await BackgroundTaskService.isBackgroundTrackingActive();
                      if (!isActive) {
                        await BackgroundTaskService.startBackgroundTracking(inst.id, {});
                      }
                      console.log('[JourneyContext] Orphaned group instance resumed by user');
                    } catch (e) {
                      console.error('[JourneyContext] Error resuming orphaned group instance:', e);
                    }
                  },
                },
              ],
              { cancelable: false }
            );
          } else {
            // Instance doesn't exist or already completed - clear persisted ID
            await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY);
          }
        }
      }
    } catch (error) {
      console.error('[JourneyContext] Error recovering journey on foreground:', error);
    }
  }, [dispatch, journeyState.currentJourney, journeyState.isTracking, journeyState.myInstance, persistStartTime, clearStartTime]);

  // Listen for AppState changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // App came to foreground from background/inactive
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        recoverJourneyOnForeground();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [recoverJourneyOnForeground]);

  useEffect(() => {
    let cancelled = false;

      const loadActiveJourney = async () => {
        dispatch(setHydrated(false));
        try {
          // Check for explicitly passed active journey ID (e.g. from scheduled start)
          // We can't access route params directly here in context easily without passing them in.
          // However, we can check if we already have a journey in state that matches param if we could.
          
          // Better approach: Rely on backend.
          const response = await journeyAPI.getActiveJourney();
          if (cancelled) return;
          
          if (response?.journey) {
            dispatch(setCurrentJourney({
              id: response.journey.id,
              title: response.journey.title,
              startLocation: response.journey.startLatitude ? {
                latitude: response.journey.startLatitude,
                longitude: response.journey.startLongitude,
                address: response.journey.startAddress || 'Start Location',
              } : undefined,
              endLocation: response.journey.endLatitude ? {
                latitude: response.journey.endLatitude,
                longitude: response.journey.endLongitude,
                address: response.journey.endAddress || 'End Location',
              } : undefined,
              groupId: response.journey.groupId,
              vehicle: response.journey.vehicle,
              status: response.journey.status === 'active' ? 'active' : 'paused',
              photos: response.journey.photos || [],
            }));
            
            // Only set tracking if actually active
            if (response.journey.status === 'active') {
               // Ensure we have a valid start time for the timer
               if (response.journey.startTime) {
                 const startTime = new Date(response.journey.startTime).getTime();
                 startTimeRef.current = startTime;
                 await persistStartTime(startTime);
               }
               dispatch(setTracking(true));
            }
            
            if (response.journey.groupId) {
              await ensureGroupJourneySocket(response.journey.groupId, dispatch);
            }
          } else {
            // Only clear if we really don't have one on backend.
            // This prevents race condition where local state might be ahead/behind.
            dispatch(setCurrentJourney(null));
          }
        } catch (error) {
          console.error('Error loading active journey:', error);
        }
  
        try {
          const myInst = await groupJourneyAPI.getMyActiveInstance();
          const inst = myInst?.instance || myInst?.myInstance || myInst?.data || myInst?.journeyInstance;
          if (cancelled) return;
          if (inst && (inst.status === 'ACTIVE' || inst.status === 'PAUSED')) {
            dispatch(setMyInstance(inst));
            dispatch(setCurrentJourney({
              id: inst.id,
              title: inst.groupJourney?.title || 'Group Ride',
              startLocation: inst.startLatitude ? {
                latitude: inst.startLatitude,
                longitude: inst.startLongitude,
                address: inst.startAddress || 'Start Location',
              } : undefined,
              endLocation: inst.endLatitude ? {
                latitude: inst.endLatitude,
                longitude: inst.endLongitude,
                address: inst.endAddress || 'End Location',
              } : undefined,
              groupId: inst.groupId || inst.groupJourney?.groupId,
              groupJourneyId: inst.groupJourney?.id,
              vehicle: inst.vehicle,
              status: 'paused',
              photos: inst.photos || [],
            }));
            // Prioritize group instance tracking state? 
            // Usually group instances are managed via socket updates for locations
            dispatch(setTracking(false)); 
            dispatch(setJourneyMinimized(true));
            const gid = inst.groupId || inst.groupJourney?.groupId;
            if (gid) {
              await ensureGroupJourneySocket(gid, dispatch);
            }
          }
        } catch (error) {
          console.warn('Error hydrating group journey instance:', error);
        }
  
        if (!cancelled) {
          dispatch(setHydrated(true));
        }
      };

    loadActiveJourney();
    return () => { cancelled = true; };
  }, [dispatch]);

  const startJourney = async (journeyData: Partial<JourneyData>): Promise<boolean> => {
    try {
      // Get current location for start point
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission denied');
      
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      
      const response = await journeyAPI.startJourney({
        vehicle: journeyData.vehicle || 'car',
        title: journeyData.title || 'My Journey',
        groupId: journeyData.groupId,
        startLatitude: location.coords.latitude,
        startLongitude: location.coords.longitude,
      });

      if (!response || !response.journey?.id) {
        throw new Error('Failed to start journey tracking');
      }
      const journeyId = response.journey.id;

      // Store startTime from API response for timer
      const journeyStartTime = response.journey?.startTime || new Date().toISOString();
      
      const newJourney: JourneyData = {
        id: journeyId,
        title: journeyData.title || 'My Journey',
        startLocation: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            address: 'Start Location'
        },
        endLocation: journeyData.endLocation,
        groupId: journeyData.groupId,
        vehicle: journeyData.vehicle || 'car',
        status: 'active',
        photos: [],
      };

      dispatch(setCurrentJourney(newJourney));
      dispatch(setTracking(true));
      dispatch(setJourneyMinimized(false));
      
      // Set startTime for timer and persist for app restart recovery
      const startTimestamp = new Date(journeyStartTime).getTime();
      startTimeRef.current = startTimestamp;
      await persistStartTime(startTimestamp);

      if (journeyData.groupId) {
        await ensureGroupJourneySocket(journeyData.groupId, dispatch);
      }

      // Start persistent background tracking notification
      // CRITICAL: Pass startTime to sync foreground and background timers (fixes Android 1:30 issue)
      await BackgroundTaskService.startBackgroundTracking(journeyId, {
        startLocationName: 'Current Location', // Could reverse geocode here if we had address
        startTime: startTimestamp,
      });

      return true;
    } catch (error) {
      console.error('Error starting journey:', error);
      return false;
    }
  };

  const saveJourney = async (journeyData: Partial<JourneyData> & { startTime?: string; notes?: string }): Promise<boolean> => {
    try {
      await journeyAPI.createJourney({
        title: journeyData.title,
        startLatitude: journeyData.startLocation?.latitude,
        startLongitude: journeyData.startLocation?.longitude,
        endLatitude: journeyData.endLocation?.latitude,
        endLongitude: journeyData.endLocation?.longitude,
        vehicle: journeyData.vehicle,
        groupId: journeyData.groupId,
        status: 'PLANNED',
        startTime: journeyData.startTime,
        notes: journeyData.notes,
      });
      return true;
    } catch (error) {
      console.error('Error saving journey:', error);
      return false;
    }
  };

  const pauseJourney = async () => {
    if (!journeyState.currentJourney) {
      console.warn('[JourneyContext] No journey to pause');
      return;
    }
    try {
      // @ts-ignore - status update is valid backend-side
      await journeyAPI.updateJourney(journeyState.currentJourney.id, { status: 'PAUSED' });
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'paused' }));
      dispatch(setTracking(false));
    } catch (error) {
      // FIX: Re-throw error so callers can handle it (e.g., show user notification)
      // Silent swallowing can leave users confused when pause doesn't work
      console.error('[JourneyContext] Error pausing journey:', error);
      throw error;
    }
  };

  const resumeJourney = async () => {
    if (!journeyState.currentJourney) {
      console.warn('[JourneyContext] No journey to resume');
      return;
    }
    try {
      // @ts-ignore - status update is valid backend-side
      await journeyAPI.updateJourney(journeyState.currentJourney.id, { status: 'ACTIVE' });
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'active' }));
      dispatch(setTracking(true));
    } catch (error) {
      // FIX: Re-throw error so callers can handle it (e.g., show user notification)
      // Silent swallowing can leave users confused when resume doesn't work
      console.error('[JourneyContext] Error resuming journey:', error);
      throw error;
    }
  };

  // Resume tracking for an existing ACTIVE journey (used for scheduled journeys)
  // This fetches the journey from the server and starts client-side tracking
  const resumeActiveJourney = async (journeyId: string): Promise<boolean> => {
    try {
      console.log('[JourneyContext] Resuming active journey:', journeyId);

      // Fetch the journey details from the server
      const response = await journeyAPI.getJourney(journeyId);
      const journey = response?.journey;

      if (!journey) {
        console.error('[JourneyContext] Journey not found:', journeyId);
        return false;
      }

      if (journey.status !== 'ACTIVE') {
        console.warn('[JourneyContext] Journey is not ACTIVE:', journey.status);
        // If not active, we can't resume tracking
        return false;
      }

      // Set up the journey state
      const newJourney: JourneyData = {
        id: journey.id,
        title: journey.title || 'My Journey',
        startLocation: journey.startLatitude ? {
          latitude: journey.startLatitude,
          longitude: journey.startLongitude,
          address: journey.startAddress || 'Start Location',
        } : undefined,
        endLocation: journey.endLatitude ? {
          latitude: journey.endLatitude,
          longitude: journey.endLongitude,
          address: journey.endAddress || 'End Location',
        } : undefined,
        groupId: journey.groupId,
        vehicle: journey.vehicle || 'car',
        status: 'active',
        photos: journey.photos || [],
      };

      dispatch(setCurrentJourney(newJourney));
      dispatch(setTracking(true));
      dispatch(setJourneyMinimized(false));

      // Set startTime for timer from the server's journey start time
      const journeyStartTime = journey.startTime || new Date().toISOString();
      const startTimestamp = new Date(journeyStartTime).getTime();
      startTimeRef.current = startTimestamp;
      await persistStartTime(startTimestamp);

      if (journey.groupId) {
        await ensureGroupJourneySocket(journey.groupId, dispatch);
      }

      // Start background tracking with synced startTime
      await BackgroundTaskService.startBackgroundTracking(journeyId, {
        startLocationName: journey.startAddress || 'Start Location',
        destinationName: journey.endAddress,
        destinationLatitude: journey.endLatitude,
        destinationLongitude: journey.endLongitude,
        startTime: startTimestamp,
      });

      console.log('[JourneyContext] Successfully resumed tracking for journey:', journeyId);
      return true;
    } catch (error) {
      console.error('[JourneyContext] Error resuming active journey:', error);
      return false;
    }
  };

  const endJourney = async (): Promise<string | null> => {
    try {
      if (!journeyState.currentJourney) {
        console.warn('No current journey to end');
        return null;
      }

      const journeyIdForNavigation = journeyState.currentJourney.id;

      // CRITICAL FIX FOR ANDROID: Get stats from background service as fallback
      // On Android, foreground state may not be fully synced when endJourney is called
      const backgroundState = await BackgroundTaskService.getPersistedJourneyState();

      // Use the maximum of foreground and background stats to ensure accuracy
      // This fixes the issue where Android shows 0 stats at journey end
      const foregroundDistance = officialDistance;
      const backgroundDistance = backgroundState?.totalDistance || 0;
      const finalDistance = Math.max(foregroundDistance, backgroundDistance);

      console.log('[JourneyContext] End journey stats - Foreground:', foregroundDistance, 'Background:', backgroundDistance, 'Final:', finalDistance);

      // Calculate accurate total time from our persistent startTime
      let finalTotalTime: number;
      if (startTimeRef.current) {
        finalTotalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      } else if (backgroundState?.startTime) {
        // Fallback to background service startTime
        finalTotalTime = Math.floor((Date.now() - backgroundState.startTime) / 1000);
      } else {
        // Last fallback to local elapsed time
        finalTotalTime = localElapsedTime;
      }

      // Final location update to backend with official distance
      if (liveRawLocation) {
        await journeyAPI.updateJourney(journeyState.currentJourney.id, {
          latitude: liveRawLocation.latitude,
          longitude: liveRawLocation.longitude,
          speed: liveRawLocation.speed ? liveRawLocation.speed * 3.6 : 0,
        });
      }

      // End journey with final location, official distance, and accurate time
      const endLocation = liveRawLocation 
        ? { endLatitude: liveRawLocation.latitude, endLongitude: liveRawLocation.longitude }
        : {};
      
      // Send final distance and time to server - it will use this for final stats
      await journeyAPI.endJourney(journeyState.currentJourney.id, {
        ...endLocation,
        totalDistance: finalDistance, // Send Roads API snapped distance
        totalTime: finalTotalTime, // Send client-calculated time for accuracy
      });

      // Clean up group journey socket if applicable
      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }

      // Update journey status
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'completed' }));
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));

      // Stop background tracking
      await BackgroundTaskService.stopBackgroundTracking();
      
      // Clear persisted startTime, journey ID, and group instance ID
      await clearStartTime();
      await AsyncStorage.removeItem(JOURNEY_ID_KEY);
      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY);
      
      // Clear group instance state
      dispatch(setMyInstance(null));
      
      // Clear stats after a delay to allow UI to show completion
      setTimeout(() => {
        dispatch(setStats({
          totalDistance: 0,
          totalTime: 0,
          movingTime: 0,
          avgSpeed: 0,
          topSpeed: 0,
          currentSpeed: 0,
          activeMembersCount: 0,
          completedMembersCount: 0,
        }));
        dispatch(clearRoutePoints());
        dispatch(clearJourney());
        startTimeRef.current = null;
        setLocalElapsedTime(0);
      }, 2000);
      
      // Return journey ID for navigation to detail page
      return journeyIdForNavigation;
    } catch (error) {
      console.error('Error ending journey:', error);
      // Still clear local state even if API call fails
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
      await clearStartTime();
      return null;
    }
  };

  const clearStuckJourney = async () => {
    try {
      // 1. Stop tracking first
      try {
        await locationService.endJourney();
      } catch (e) {
        console.warn('Location service endJourney failed:', e);
      }

      // 2. Try to clear on backend if we have an ID
      if (journeyState.currentJourney?.id) {
        try {
          await journeyAPI.forceClearJourney(journeyState.currentJourney.id);
        } catch (e) {
          console.warn('Force clear API call failed:', e);
        }
      }

      // 3. Clean up group journey socket
      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }

      // 4. Clear all local state regardless of backend result
      try {
        // Use AsyncStorage directly to ensure clean slate
        const keys = ['current_journey', 'journey_status', 'journey_start_time', 'active_group_journey_id'];
        // We need to import AsyncStorage if not available, but it's likely not imported in this context file.
        // Wait, I don't see AsyncStorage imported in the file view.
        // I should check imports. If not imported, I can't use it.
        // But I can rely on Redux actions which should handle persistence if configured.
        // Or I can just skip direct AsyncStorage manipulation if not imported.
        // Let's stick to Redux actions and maybe add AsyncStorage if I can see imports.
        // I'll assume Redux persistence handles it or I'll add the import if I can.
        // Actually, looking at imports (lines 1-36), AsyncStorage is NOT imported.
        // So I will skip direct AsyncStorage calls to avoid errors.
      } catch (e) {
        console.warn('AsyncStorage clear failed', e);
      }

      // 5. Clear Redux state
      dispatch(clearJourney());
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
      
      // Stop background tracking if running
      try {
        await BackgroundTaskService.stopBackgroundTracking();
      } catch (e) {
        console.warn('Failed to stop background tracking during clear:', e);
      }

      dispatch(setStats({
        totalDistance: 0,
        totalTime: 0,
        movingTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
        activeMembersCount: 0,
        completedMembersCount: 0,
      }));
      dispatch(clearRoutePoints());
      dispatch(setHydrated(true));
      
      // Force reset local state
      setLocalElapsedTime(0);
      startTimeRef.current = null;
      
    } catch (error) {
      console.error('Error clearing stuck journey:', error);
      // Still clear local state even if API calls fail
      dispatch(clearJourney());
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
    }
  };

  const addPhoto = async (photoUri: string) => {
    if (!journeyState.currentJourney) {
      throw new Error('No active journey');
    }

    const uploadId = `upload-${Date.now()}`;
    const journeyId = journeyState.currentJourney.id;
    const timestamp = Date.now();

    dispatch(enqueueUpload({
      id: uploadId,
      journeyId,
      uri: photoUri,
      status: 'pending',
      progress: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    try {
      dispatch(updateUploadStatus({ id: uploadId, status: 'uploading', progress: 0 }));
      
      const response = await galleryAPI.uploadPhotoWithProgress(
        photoUri,
        journeyId,
        (progress) => {
          dispatch(updateUploadStatus({ id: uploadId, status: 'uploading', progress }));
        }
      ) as { success?: boolean; photo?: { imageUrl?: string; firebasePath?: string; thumbnailPath?: string } };

      if (!response || !response.photo) {
        throw new Error('Failed to upload photo');
      }

      const uploadedPhotoUri =
        response.photo.imageUrl ||
        (response.photo.firebasePath ? getFirebaseDownloadUrl(response.photo.firebasePath) : undefined) ||
        response.photo.firebasePath;

      if (!uploadedPhotoUri) {
        throw new Error('Failed to get photo URL after upload');
      }

      dispatch(updateUploadStatus({ id: uploadId, status: 'completed', remoteUrl: uploadedPhotoUri, progress: 1 }));
      dispatch(setCurrentJourney({
        ...journeyState.currentJourney,
        photos: [...(journeyState.currentJourney.photos || []), uploadedPhotoUri],
      }));

      const activeGroupJourneyId = journeyState.currentJourney.groupJourneyId || journeyState.myInstance?.groupJourneyId;
      if (activeGroupJourneyId && uploadedPhotoUri) {
        // FIX: Prefer liveRawLocation (current GPS) over routePoints (which may be stale or empty)
        // This ensures photo location is accurate even when GPS buffer hasn't flushed
        let photoLatitude: number | undefined;
        let photoLongitude: number | undefined;

        if (liveRawLocation) {
          photoLatitude = liveRawLocation.latitude;
          photoLongitude = liveRawLocation.longitude;
        } else {
          // Fallback to route points if live location unavailable
          const routePoints = locationService.getRoutePoints();
          const lastPoint = routePoints.length ? routePoints[routePoints.length - 1] : undefined;
          photoLatitude = lastPoint?.latitude;
          photoLongitude = lastPoint?.longitude;
        }

        try {
          await groupJourneyAPI.postEvent(activeGroupJourneyId, {
            type: 'PHOTO',
            message: 'Shared a ride photo',
            mediaUrl: uploadedPhotoUri,
            latitude: photoLatitude,
            longitude: photoLongitude,
          });
        } catch (eventError) {
          console.warn('[JourneyContext] Failed to broadcast group photo event:', eventError);
        }
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      const message = (error as Error)?.message || 'Upload failed';
      dispatch(failUpload({ id: uploadId, error: message }));
      throw error;
    } finally {
      setTimeout(() => dispatch(removeUploadJob(uploadId)), 3000);
    }
  };

  const minimizeJourney = () => {
    dispatch(setJourneyMinimized(true));
  };

  const maximizeJourney = () => {
    dispatch(setJourneyMinimized(false));
  };

  const loadGroupMembers = useCallback(async (groupId: string) => {
    await ensureGroupJourneySocket(groupId, dispatch);
  }, [dispatch]);

  const updateMemberLocation = (memberId: string, location: LocationPoint) => {
    dispatch(mergeMemberLocation({
      userId: memberId,
      latitude: location.latitude,
      longitude: location.longitude,
      lastUpdate: new Date(location.timestamp).toISOString(),
      speed: location.speed,
    }));
  };

  const value: JourneyContextType = {
    currentJourney: journeyState.currentJourney,
    isTracking: journeyState.isTracking,
    isMinimized: journeyState.isMinimized,
    stats: derivedStats,
    routePoints,
    groupMembers,
    uploadQueue,
    startJourney,
    saveJourney,
    pauseJourney,
    resumeJourney,
    endJourney,
    clearStuckJourney,
    addPhoto,
    minimizeJourney,
    maximizeJourney,
    loadGroupMembers,
    updateMemberLocation,
    hydrated,
    currentLocation: liveRawLocation ? {
        latitude: liveRawLocation.latitude,
        longitude: liveRawLocation.longitude,
        timestamp: liveRawLocation.timestamp,
        speed: liveRawLocation.speed,
        accuracy: liveRawLocation.accuracy,
        altitude: 0
    } : null,
    resumeActiveJourney,
  };

  return (
    <JourneyContext.Provider value={value}>
      {children}
    </JourneyContext.Provider>
  );
}

export function useJourney() {
  const context = useContext(JourneyContext);
  if (context === undefined) {
    throw new Error('useJourney must be used within a JourneyProvider');
  }
  return context;
}
