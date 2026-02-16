// app/contexts/JourneyContext.tsx
// Journey state management and real-time tracking bridged through Redux

import React, { createContext, useContext, useEffect, useMemo, ReactNode, useCallback, useRef, useState } from 'react';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI, groupJourneyAPI, galleryAPI } from '../services/api';
import { ensureGroupJourneySocket, teardownGroupJourneySocket } from '../services/groupJourneySocket';
import { on as socketOn, off as socketOff } from '../services/socket';
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
import LiveNotificationService, { JourneyNotificationData } from '../services/liveNotificationService';
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

  // Foreground → Live Activity / Notification sync
  // This ensures the iOS Live Activity and Android notification get accurate data
  // from the foreground smart tracking (speed, distance, time, progress, addresses)
  const liveNotificationThrottleRef = useRef<number>(0);
  useEffect(() => {
    if (!journeyState.isTracking || !journeyState.currentJourney) return;

    // Throttle updates to every 3 seconds to avoid excessive native bridge calls
    const now = Date.now();
    if (now - liveNotificationThrottleRef.current < 3000) return;
    liveNotificationThrottleRef.current = now;

    const journey = journeyState.currentJourney;
    const currentStartTime = journeyState.myInstance?.startTime
      ? new Date(journeyState.myInstance.startTime).getTime()
      : startTimeRef.current || now;

    // Calculate progress based on distance to destination
    let progress = 0;
    let distanceRemaining: number | undefined;
    if (journey.endLocation && liveRawLocation) {
      const R = 6371;
      const dLat = (journey.endLocation.latitude - liveRawLocation.latitude) * Math.PI / 180;
      const dLon = (journey.endLocation.longitude - liveRawLocation.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(liveRawLocation.latitude * Math.PI / 180) *
        Math.cos(journey.endLocation.latitude * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      distanceRemaining = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // Estimate total distance as distance traveled + remaining
      const estimatedTotal = officialDistance + distanceRemaining;
      if (estimatedTotal > 0) {
        progress = Math.min(officialDistance / estimatedTotal, 0.99);
      }
    }

    const notificationData: JourneyNotificationData = {
      journeyId: journey.id,
      startTime: currentStartTime,
      totalDistance: officialDistance,
      currentSpeed: derivedStats.currentSpeed, // km/h from smart tracking
      avgSpeed: avgSpeed, // km/h
      topSpeed: maxSpeed, // km/h
      movingTime: movingTime,
      progress,
      distanceRemaining,
      startLocationName: journey.startLocation?.address || 'Start',
      destinationName: journey.endLocation?.address || 'Destination',
      currentLatitude: liveRawLocation?.latitude,
      currentLongitude: liveRawLocation?.longitude,
    };

    LiveNotificationService.updateNotification(notificationData).catch(e => {
      console.warn('[JourneyContext] Live notification update failed:', e);
    });
  }, [liveRawLocation, officialDistance, derivedStats.currentSpeed, avgSpeed, maxSpeed, movingTime, journeyState.isTracking, journeyState.currentJourney, journeyState.myInstance?.startTime]);

  // Backend & Socket Updates (throttled to every 5 seconds)
  const backendUpdateThrottleRef = useRef<number>(0);
  useEffect(() => {
    if (!journeyState.isTracking || !liveRawLocation || !journeyState.currentJourney) return;

    // Throttle backend updates to every 5 seconds to avoid flooding the server
    const now = Date.now();
    if (now - backendUpdateThrottleRef.current < 5000) return;
    backendUpdateThrottleRef.current = now;

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

    updateBackend();

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
        
        // 3. Orphaned group journey instances are handled by StaleRideRecovery component
        // Just clean up stale persisted IDs if no active instance found
        const persistedInstanceId = await AsyncStorage.getItem(GROUP_INSTANCE_ID_KEY);
        if (persistedInstanceId && !journeyState.currentJourney && !journeyState.myInstance) {
          try {
            const myInst = await groupJourneyAPI.getMyActiveInstance();
            const inst = myInst?.instance || myInst?.myInstance || myInst?.data || myInst?.journeyInstance;
            if (!inst || (inst.status !== 'ACTIVE' && inst.status !== 'PAUSED')) {
              // Instance doesn't exist or already completed - clear persisted ID
              await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY);
            }
          } catch {
            // Silently fail - StaleRideRecovery component will handle this
          }
        }
      }
    } catch (error) {
      console.error('[JourneyContext] Error recovering journey on foreground:', error);
    }
  }, [dispatch, journeyState.currentJourney, journeyState.isTracking, journeyState.myInstance, persistStartTime, clearStartTime]);

  // Sync foreground state to background when app goes to background
  const syncToBackgroundOnSuspend = useCallback(async () => {
    if (!journeyState.isTracking || !journeyState.currentJourney) return;

    try {
      console.log('[JourneyContext] App going to background, syncing foreground state...');

      // 1. Sync foreground tracking data to background persisted state
      await BackgroundTaskService.syncForegroundToBackground({
        totalDistance: officialDistance,
        movingTime: movingTime,
        topSpeed: maxSpeed,
        currentSpeed: derivedStats.currentSpeed,
        currentLatitude: liveRawLocation?.latitude,
        currentLongitude: liveRawLocation?.longitude,
      });

      // 2. Force an immediate Live Activity / notification update (bypass throttle)
      const journey = journeyState.currentJourney;
      const currentStartTime = journeyState.myInstance?.startTime
        ? new Date(journeyState.myInstance.startTime).getTime()
        : startTimeRef.current || Date.now();

      let progress = 0;
      let distanceRemaining: number | undefined;
      if (journey.endLocation && liveRawLocation) {
        const R = 6371;
        const dLat = (journey.endLocation.latitude - liveRawLocation.latitude) * Math.PI / 180;
        const dLon = (journey.endLocation.longitude - liveRawLocation.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(liveRawLocation.latitude * Math.PI / 180) *
          Math.cos(journey.endLocation.latitude * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        distanceRemaining = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const estimatedTotal = officialDistance + distanceRemaining;
        if (estimatedTotal > 0) {
          progress = Math.min(officialDistance / estimatedTotal, 0.99);
        }
      }

      const notificationData: JourneyNotificationData = {
        journeyId: journey.id,
        startTime: currentStartTime,
        totalDistance: officialDistance,
        currentSpeed: derivedStats.currentSpeed,
        avgSpeed: avgSpeed,
        topSpeed: maxSpeed,
        movingTime: movingTime,
        progress,
        distanceRemaining,
        startLocationName: journey.startLocation?.address || 'Start',
        destinationName: journey.endLocation?.address || 'Destination',
        currentLatitude: liveRawLocation?.latitude,
        currentLongitude: liveRawLocation?.longitude,
      };

      // Reset throttle so this sends immediately
      liveNotificationThrottleRef.current = 0;
      await LiveNotificationService.updateNotification(notificationData);
      console.log('[JourneyContext] Background sync complete');
    } catch (error) {
      console.error('[JourneyContext] Error syncing to background:', error);
    }
  }, [journeyState.isTracking, journeyState.currentJourney, journeyState.myInstance?.startTime,
      officialDistance, movingTime, maxSpeed, avgSpeed, derivedStats.currentSpeed, liveRawLocation]);

  // Merge background state when app returns to foreground
  const mergeBackgroundStateOnForeground = useCallback(async () => {
    if (!journeyState.isTracking || !journeyState.currentJourney) return;

    try {
      const bgState = await BackgroundTaskService.getBackgroundAccumulatedState();
      if (!bgState) return;

      console.log('[JourneyContext] Merging background state - BG distance:', bgState.totalDistance.toFixed(2),
        'FG distance:', officialDistance.toFixed(2));

      // If background accumulated more distance than foreground has
      // (because background kept tracking while app was suspended),
      // we need to sync the background's persisted state so the next
      // foreground GPS readings build on top of it.
      // The foreground smart tracking will naturally pick up from current position.

      // Also re-trigger an immediate Live Activity update with fresh foreground data
      liveNotificationThrottleRef.current = 0;
    } catch (error) {
      console.error('[JourneyContext] Error merging background state:', error);
    }
  }, [journeyState.isTracking, journeyState.currentJourney, officialDistance]);

  // Listen for AppState changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // App going to background — sync foreground state
      if (
        appStateRef.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        syncToBackgroundOnSuspend();
      }

      // App came to foreground from background/inactive
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        recoverJourneyOnForeground();
        mergeBackgroundStateOnForeground();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [recoverJourneyOnForeground, syncToBackgroundOnSuspend, mergeBackgroundStateOnForeground]);

  // Listen for admin-end group journey completion via socket
  // This ensures full client cleanup when an admin ends the group journey externally
  useEffect(() => {
    const handleGroupJourneyCompleted = async (data: any) => {
      const activeGroupJourneyId = journeyState.currentJourney?.groupJourneyId || journeyState.myInstance?.groupJourneyId;
      if (!activeGroupJourneyId) return;
      if (data?.groupJourneyId !== activeGroupJourneyId) return;

      console.log('[JourneyContext] Group journey ended externally, cleaning up...');

      // Stop tracking
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));

      // Teardown group socket
      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }

      // Stop background tracking
      try { await BackgroundTaskService.stopBackgroundTracking(); } catch {}

      // Dismiss notification / Live Activity
      try { await LiveNotificationService.dismissNotification(); } catch {}

      // Clear persisted keys
      await clearStartTime();
      await AsyncStorage.removeItem(JOURNEY_ID_KEY).catch(() => {});
      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY).catch(() => {});

      // Clear Redux state
      dispatch(setMyInstance(null));
      dispatch(setStats({
        totalDistance: 0, totalTime: 0, movingTime: 0,
        avgSpeed: 0, topSpeed: 0, currentSpeed: 0,
        activeMembersCount: 0, completedMembersCount: 0,
      }));
      dispatch(clearRoutePoints());
      dispatch(clearJourney());
      startTimeRef.current = null;
      setLocalElapsedTime(0);
    };

    socketOn('group-journey:completed', handleGroupJourneyCompleted);
    return () => { socketOff('group-journey:completed', handleGroupJourneyCompleted); };
  }, [dispatch, journeyState.currentJourney?.groupJourneyId, journeyState.currentJourney?.groupId, journeyState.myInstance?.groupJourneyId, clearStartTime]);

  useEffect(() => {
    let cancelled = false;

      const loadActiveJourney = async () => {
        dispatch(setHydrated(false));

        // Fetch both solo and group journeys in parallel to avoid races
        const [soloResult, groupResult] = await Promise.all([
          journeyAPI.getActiveJourney().catch((error) => {
            console.error('Error loading active journey:', error);
            return null;
          }),
          groupJourneyAPI.getMyActiveInstance().catch((error) => {
            console.warn('Error hydrating group journey instance:', error);
            return null;
          }),
        ]);

        if (cancelled) return;

        const soloJourney = soloResult?.journey || null;
        const groupInst = (() => {
          const inst = groupResult?.instance || groupResult?.myInstance || groupResult?.data || groupResult?.journeyInstance;
          return inst && (inst.status === 'ACTIVE' || inst.status === 'PAUSED') ? inst : null;
        })();

        // Prefer group instance if both are active
        if (groupInst) {
          dispatch(setMyInstance(groupInst));
          const isInstanceActive = groupInst.status === 'ACTIVE';
          dispatch(setCurrentJourney({
            id: groupInst.id,
            title: groupInst.groupJourney?.title || 'Group Ride',
            startLocation: groupInst.startLatitude ? {
              latitude: groupInst.startLatitude,
              longitude: groupInst.startLongitude,
              address: groupInst.startAddress || 'Start Location',
            } : undefined,
            endLocation: groupInst.endLatitude ? {
              latitude: groupInst.endLatitude,
              longitude: groupInst.endLongitude,
              address: groupInst.endAddress || 'End Location',
            } : undefined,
            groupId: groupInst.groupId || groupInst.groupJourney?.groupId,
            groupJourneyId: groupInst.groupJourney?.id,
            vehicle: groupInst.vehicle,
            status: isInstanceActive ? 'active' : 'paused',
            photos: groupInst.photos || [],
          }));
          dispatch(setTracking(isInstanceActive));
          dispatch(setJourneyMinimized(true));
          const gid = groupInst.groupId || groupInst.groupJourney?.groupId;
          if (gid) {
            await ensureGroupJourneySocket(gid, dispatch);
          }
        } else if (soloJourney) {
          dispatch(setCurrentJourney({
            id: soloJourney.id,
            title: soloJourney.title,
            startLocation: soloJourney.startLatitude ? {
              latitude: soloJourney.startLatitude,
              longitude: soloJourney.startLongitude,
              address: soloJourney.startAddress || 'Start Location',
            } : undefined,
            endLocation: soloJourney.endLatitude ? {
              latitude: soloJourney.endLatitude,
              longitude: soloJourney.endLongitude,
              address: soloJourney.endAddress || 'End Location',
            } : undefined,
            groupId: soloJourney.groupId,
            vehicle: soloJourney.vehicle,
            status: soloJourney.status === 'active' ? 'active' : 'paused',
            photos: soloJourney.photos || [],
          }));

          if (soloJourney.status === 'active') {
            if (soloJourney.startTime) {
              const startTime = new Date(soloJourney.startTime).getTime();
              startTimeRef.current = startTime;
              await persistStartTime(startTime);
            }
            dispatch(setTracking(true));
          }

          if (soloJourney.groupId) {
            await ensureGroupJourneySocket(soloJourney.groupId, dispatch);
          }
        } else {
          dispatch(setCurrentJourney(null));
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
      // STEP 1: Permission check — typically instant if already granted
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission denied');

      // STEP 2: Get location FAST using layered strategy
      // 1st: Try getLastKnownPositionAsync (instant, cached GPS — usually <10ms)
      // 2nd: Fall back to getCurrentPositionAsync with Balanced accuracy (1-3s)
      // This alone saves 5-20s vs the old BestForNavigation approach
      let location: Location.LocationObject | null = null;
      try {
        location = await Location.getLastKnownPositionAsync();
      } catch {
        // getLastKnownPosition can fail silently on some devices
      }

      if (!location || (Date.now() - location.timestamp) > 60000) {
        // No cached position or it's >60s stale — get a fresh one (fast accuracy)
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }

      // STEP 3: API call to create journey on server
      let response: any;
      try {
        response = await journeyAPI.startJourney({
          vehicle: journeyData.vehicle || 'car',
          title: journeyData.title || 'My Journey',
          groupId: journeyData.groupId,
          startLatitude: location.coords.latitude,
          startLongitude: location.coords.longitude,
        });
      } catch (apiError: any) {
        // Handle "Active journey exists" — ask user what to do
        if (apiError?.status === 400 && apiError?.body?.activeJourney?.id) {
          const staleJourney = apiError.body.activeJourney;
          const staleId = staleJourney.id;

          // Sanity check: auto-terminate if stats look like garbage / zombie journey
          const staleElapsedMs = staleJourney.startTime
            ? Date.now() - new Date(staleJourney.startTime).getTime()
            : 0;
          const staleElapsedHrs = staleElapsedMs / 3_600_000;
          const staleDist = staleJourney.totalDistance ?? -1;
          const staleAvgSpeed = staleJourney.avgSpeed ?? -1;
          const staleTopSpeed = staleJourney.topSpeed ?? -1;

          const isZombie =
            // No start time at all
            !staleJourney.startTime ||
            // Running >6 hours with essentially no distance (<0.1 km)
            (staleElapsedHrs > 6 && staleDist < 0.1) ||
            // Running >2 hours with null/zero distance AND null/zero speed
            (staleElapsedHrs > 2 && staleDist <= 0 && staleAvgSpeed <= 0 && staleTopSpeed <= 0) ||
            // Null distance or negative values (corrupt data)
            staleDist < 0 ||
            // Impossibly high speed (>500 km/h) suggests corrupt data
            staleTopSpeed > 500 ||
            // Running >24 hours — definitely stale
            staleElapsedHrs > 24;

          if (isZombie) {
            console.log('[JourneyContext] Zombie journey detected, auto-terminating:', staleId,
              { elapsedHrs: staleElapsedHrs.toFixed(1), dist: staleDist, avgSpd: staleAvgSpeed, topSpd: staleTopSpeed });
            try {
              await journeyAPI.endJourney(staleId, {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                totalDistance: Math.max(staleDist, 0),
              });
            } catch {
              await journeyAPI.forceClearJourney(staleId).catch(() => {});
            }
            await BackgroundTaskService.stopBackgroundTracking().catch(() => {});
            try { await LiveNotificationService.dismissNotification(); } catch {}
            await clearStartTime();
            await AsyncStorage.removeItem(JOURNEY_ID_KEY).catch(() => {});
            await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY).catch(() => {});

            // Retry the start immediately — no user prompt needed
            response = await journeyAPI.startJourney({
              vehicle: journeyData.vehicle || 'car',
              title: journeyData.title || 'My Journey',
              groupId: journeyData.groupId,
              startLatitude: location.coords.latitude,
              startLongitude: location.coords.longitude,
            });
          } else {
          // Journey looks legitimate — ask the user

          // Calculate how long ago the stale journey started
          let timeAgo = '';
          if (staleJourney.startTime) {
            const mins = Math.floor(staleElapsedMs / 60000);
            const hrs = Math.floor(mins / 60);
            timeAgo = hrs > 0 ? ` from ${hrs}h ${mins % 60}m ago` : ` from ${mins}m ago`;
          }

          // Prompt user: continue the existing journey or end it?
          const userChoice = await new Promise<'continue' | 'end'>((resolve) => {
            Alert.alert(
              'Active Journey Found',
              `You have an unfinished journey${timeAgo}. Would you like to continue it or end it and start a new one?`,
              [
                {
                  text: 'Continue Existing',
                  style: 'default',
                  onPress: () => resolve('continue'),
                },
                {
                  text: 'End & Start New',
                  style: 'destructive',
                  onPress: () => resolve('end'),
                },
              ],
              { cancelable: false },
            );
          });

          if (userChoice === 'continue') {
            // Hydrate the existing journey from server and resume tracking
            try {
              const existing = await journeyAPI.getJourney(staleId);
              const journey = existing?.journey;
              if (journey) {
                const recoveredStartTime = journey.startTime
                  ? new Date(journey.startTime).getTime()
                  : Date.now();

                dispatch(setCurrentJourney({
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
                  status: journey.status === 'PAUSED' ? 'paused' : 'active',
                  photos: journey.photos || [],
                }));

                startTimeRef.current = recoveredStartTime;
                await persistStartTime(recoveredStartTime);

                const isActive = journey.status !== 'PAUSED';
                dispatch(setTracking(isActive));
                dispatch(setJourneyMinimized(false));

                // Restart background tracking if not already running
                const bgActive = await BackgroundTaskService.isBackgroundTrackingActive();
                if (!bgActive && isActive) {
                  BackgroundTaskService.startBackgroundTracking(journey.id, {
                    startTime: recoveredStartTime,
                  }).catch(() => {});
                }

                if (journey.groupId) {
                  ensureGroupJourneySocket(journey.groupId, dispatch).catch(() => {});
                }
              }
            } catch (e) {
              console.error('[JourneyContext] Error resuming existing journey:', e);
            }
            // Return true — journey is active, callers will navigate to journey screen
            return true;
          }

          // User chose "End & Start New" — terminate the old one gracefully
          console.log('[JourneyContext] User chose to end stale journey:', staleId);
          try {
            await journeyAPI.endJourney(staleId, {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              totalDistance: staleJourney.totalDistance || 0,
            });
          } catch (endErr) {
            console.warn('[JourneyContext] endJourney failed, trying forceClear:', endErr);
            await journeyAPI.forceClearJourney(staleId).catch(() => {});
          }
          // Clean up any local state from the stale journey
          await BackgroundTaskService.stopBackgroundTracking().catch(() => {});
          try { await LiveNotificationService.dismissNotification(); } catch {}
          await clearStartTime();
          await AsyncStorage.removeItem(JOURNEY_ID_KEY).catch(() => {});
          await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY).catch(() => {});

          // Now retry the start with a clean slate
          response = await journeyAPI.startJourney({
            vehicle: journeyData.vehicle || 'car',
            title: journeyData.title || 'My Journey',
            groupId: journeyData.groupId,
            startLatitude: location.coords.latitude,
            startLongitude: location.coords.longitude,
          });
          } // end else (non-zombie — user prompt path)
        } else {
          throw apiError;
        }
      }

      if (!response || !response.journey?.id) {
        throw new Error('Failed to start journey tracking');
      }
      const journeyId = response.journey.id;

      // STEP 4: Capture start time AFTER async ops so timer starts at ~0
      const startTimestamp = Date.now();
      
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

      // STEP 5: Immediately update UI state — this is what the user sees
      dispatch(setCurrentJourney(newJourney));
      dispatch(setTracking(true));
      dispatch(setJourneyMinimized(false));
      startTimeRef.current = startTimestamp;

      // STEP 6: Fire non-blocking background work in parallel
      // None of these need to complete before the user sees the journey screen
      const backgroundWork: Promise<any>[] = [];

      // Persist start time (non-blocking)
      backgroundWork.push(
        persistStartTime(startTimestamp).catch(e =>
          console.warn('[JourneyContext] persistStartTime failed:', e)
        )
      );

      // Group socket connection (non-blocking)
      if (journeyData.groupId) {
        backgroundWork.push(
          ensureGroupJourneySocket(journeyData.groupId, dispatch).catch(e =>
            console.warn('[JourneyContext] Group socket init failed:', e)
          )
        );
      }

      // Calculate estimated total distance if we have a destination
      let estimatedTotalDistance: number | undefined;
      if (journeyData.endLocation) {
        const R = 6371;
        const dLat = (journeyData.endLocation.latitude - location.coords.latitude) * Math.PI / 180;
        const dLon = (journeyData.endLocation.longitude - location.coords.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(location.coords.latitude * Math.PI / 180) *
          Math.cos(journeyData.endLocation.latitude * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        estimatedTotalDistance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      // Background tracking init (non-blocking, passes location to skip redundant GPS call)
      backgroundWork.push(
        BackgroundTaskService.startBackgroundTracking(journeyId, {
          startLocationName: journeyData.startLocation?.address || newJourney.startLocation?.address || 'Start',
          destinationName: journeyData.endLocation?.address,
          destinationLatitude: journeyData.endLocation?.latitude,
          destinationLongitude: journeyData.endLocation?.longitude,
          estimatedTotalDistance,
          startTime: startTimestamp,
          initialLocation: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
          },
        }).catch(err =>
          console.warn('[JourneyContext] Background tracking init failed (non-blocking):', err)
        )
      );

      // Fire all background work without blocking return
      Promise.all(backgroundWork).catch(() => {});

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
      await journeyAPI.pauseJourney(journeyState.currentJourney.id);
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'paused' }));
      dispatch(setTracking(false));
    } catch (error) {
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
      await journeyAPI.resumeJourney(journeyState.currentJourney.id);
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'active' }));
      dispatch(setTracking(true));
    } catch (error) {
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

      // FIX: For scheduled journeys, use CURRENT time when user actually starts tracking
      const startTimestamp = Date.now();
      startTimeRef.current = startTimestamp;

      // Fire all secondary work in parallel without blocking
      const backgroundWork: Promise<any>[] = [];

      backgroundWork.push(
        persistStartTime(startTimestamp).catch(e =>
          console.warn('[JourneyContext] persistStartTime failed:', e)
        )
      );

      // Update the server with the actual tracking start time (non-blocking)
      backgroundWork.push(
        journeyAPI.updateJourney(journeyId, {
          timestamp: new Date().toISOString(),
        }).catch(e =>
          console.warn('[JourneyContext] Failed to update journey start time on server:', e)
        )
      );

      if (journey.groupId) {
        backgroundWork.push(
          ensureGroupJourneySocket(journey.groupId, dispatch).catch(e =>
            console.warn('[JourneyContext] Group socket init failed:', e)
          )
        );
      }

      // Start background tracking with synced startTime (non-blocking)
      backgroundWork.push(
        BackgroundTaskService.startBackgroundTracking(journeyId, {
          startLocationName: journey.startAddress || 'Start Location',
          destinationName: journey.endAddress,
          destinationLatitude: journey.endLatitude,
          destinationLongitude: journey.endLongitude,
          startTime: startTimestamp,
        }).catch(err =>
          console.warn('[JourneyContext] Background tracking init failed (non-blocking):', err)
        )
      );

      Promise.all(backgroundWork).catch(() => {});

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

      // Sync group journey instance completion to backend
      if (journeyState.myInstance?.id) {
        try {
          const endCoords = endLocation.endLatitude && endLocation.endLongitude
            ? { endLatitude: endLocation.endLatitude, endLongitude: endLocation.endLongitude }
            : {};
          await groupJourneyAPI.completeInstance(journeyState.myInstance.id, endCoords);
          console.log('[JourneyContext] Group instance completed:', journeyState.myInstance.id);
        } catch (groupErr) {
          // Non-blocking - solo journey already ended, stale timeout is the safety net
          console.warn('[JourneyContext] Failed to complete group instance (non-blocking):', groupErr);
        }
      }

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

      // Dismiss Live Activity / notification so it stops counting
      try {
        await LiveNotificationService.dismissNotification();
      } catch (e) {
        console.warn('[JourneyContext] Failed to dismiss notification on end:', e);
      }

      // Clear persisted startTime, journey ID, and group instance ID
      await clearStartTime();
      await AsyncStorage.removeItem(JOURNEY_ID_KEY);
      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY);
      
      // Clear group instance state
      dispatch(setMyInstance(null));
      
      // Clear stats and route immediately; currentJourney was already set to 'completed' above
      // so the UI can read it briefly for transition before clearJourney wipes it
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
      startTimeRef.current = null;
      setLocalElapsedTime(0);

      // Clear journey state immediately — no delay to avoid race conditions
      // where a new journey could start and get wiped by a stale timeout.
      // Status was already set to 'completed' above for any UI that needs it.
      dispatch(clearJourney());
      
      // Return journey ID for navigation to detail page
      return journeyIdForNavigation;
    } catch (error) {
      console.error('Error ending journey:', error);
      // Still clear local state even if API call fails
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
      await clearStartTime();
      // Dismiss Live Activity even on error to prevent zombie notifications
      try {
        await LiveNotificationService.dismissNotification();
      } catch (e) {
        console.warn('[JourneyContext] Failed to dismiss notification on error:', e);
      }
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
        await AsyncStorage.multiRemove([
          'current_journey', 'journey_status', 'journey_start_time',
          'active_group_journey_id', 'active_journey_id', 'active_group_instance_id',
        ]);
        await clearStartTime();
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

      // Dismiss Live Activity / notification
      try {
        await LiveNotificationService.dismissNotification();
      } catch (e) {
        console.warn('Failed to dismiss notification during clear:', e);
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
      
      const captureStats = {
        speed: derivedStats.currentSpeed || undefined,
        distance: officialDistance || undefined,
      };

      const response = await galleryAPI.uploadPhotoWithProgress(
        photoUri,
        journeyId,
        (progress) => {
          dispatch(updateUploadStatus({ id: uploadId, status: 'uploading', progress }));
        },
        captureStats
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
            captureSpeed: derivedStats.currentSpeed || undefined,
            captureDistance: officialDistance || undefined,
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
