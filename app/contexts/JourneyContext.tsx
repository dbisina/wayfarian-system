// app/contexts/JourneyContext.tsx

import React, { createContext, useContext, useEffect, useMemo, ReactNode, useCallback, useRef, useState } from 'react';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI, groupJourneyAPI, galleryAPI } from '../services/api';
import { ensureGroupJourneySocket, teardownGroupJourneySocket } from '../services/groupJourneySocket';
import { on as socketOn, off as socketOff } from '../services/socket';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useSmartTracking } from '../hooks/useSmartTracking';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, Alert, Platform } from 'react-native';
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
import BackgroundLocationDisclosureModal from '../components/BackgroundLocationDisclosureModal';
import BatteryOptimizationModal from '../components/BatteryOptimizationModal';

export type { GroupMember, JourneyData } from '../store/slices/journeySlice';

/**
 * Shape of the value exposed by JourneyContext.
 * Consumed via the `useJourney` hook — never read the context directly.
 */
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
  resumeActiveJourney: (journeyId: string) => Promise<boolean>;
}

const JourneyContext = createContext<JourneyContextType | undefined>(undefined);

/**
 * Provides journey state and tracking actions to the component tree.
 * Bridges Redux (persistence/sharing) with real-time GPS via `useSmartTracking`,
 * manages background/foreground transitions, and handles iOS Live Activities
 * and Android foreground notifications.
 *
 * Mount once at the root — use `useJourney` to access the context value.
 */
export function JourneyProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const journeyState = useJourneyState();
  const hydrated = useJourneyHydration();
  const groupMembers = useJourneyMembers();
  const statsFromStore = useJourneyStats();
  const routePoints = useJourneyRoutePoints();
  const uploadQueue = useJourneyUploadQueue();
  const distanceUnit = useAppSelector(state => state.ui.preferences.distanceUnit);

  // Use Smart Tracking Hook. Pass the active journey's vehicle so the speed cap is realistic.
  const activeVehicle = (journeyState.currentJourney?.vehicle as 'car' | 'bike' | 'scooter' | undefined) || 'car';
  const {
    liveRawLocation,
    officialSnappedPath,
    officialDistance,
    movingTime,
    avgSpeed,
    maxSpeed
  } = useSmartTracking(journeyState.isTracking, activeVehicle);

  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [pendingJourneyData, setPendingJourneyData] = useState<Partial<JourneyData> | null>(null);

  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const BATTERY_ASKED_KEY = 'battery_opt_asked_at';

  // Show the battery optimization prompt if the OS is still throttling the app.
  // We ask at most once every 7 days so it doesn't nag on every journey.
  const checkAndShowBatteryOptimization = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const askedAt = await AsyncStorage.getItem(BATTERY_ASKED_KEY);
      if (askedAt) {
        const daysSinceAsked = (Date.now() - parseInt(askedAt, 10)) / 86_400_000;
        if (daysSinceAsked < 7) return; // asked recently
      }
      const notifee = (await import('@notifee/react-native')).default;
      const isOptimized = await notifee.isBatteryOptimizationEnabled();
      if (isOptimized) {
        // Battery is still restricted — prompt the user
        await AsyncStorage.setItem(BATTERY_ASKED_KEY, String(Date.now()));
        // Small delay so the journey screen has time to settle before the sheet rises
        setTimeout(() => setShowBatteryModal(true), 1200);
      }
    } catch {
      // Non-critical — silently skip
    }
  }, []);

  const [localElapsedTime, setLocalElapsedTime] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const JOURNEY_START_TIME_KEY = 'journey_start_time';

  // Accumulated distance/movingTime from all segments completed before the current pause.
  // useSmartTracking resets to 0 every time isTracking goes false→true (new subscription).
  // These refs carry the history forward so pause/resume doesn't wipe the journey totals.
  const preResumeDistanceRef = useRef<number>(0);
  const preResumeMovingTimeRef = useRef<number>(0);

  // Routes accumulated before the current segment. On resume, useSmartTracking resets
  // officialSnappedPath to [] which would dispatch setRoutePoints([]) and wipe the
  // polyline from Redux. Captured at pause-time so the route-sync effect can prepend it.
  const routePointsBaselineRef = useRef<RoutePoint[]>([]);

  // Mirrors of fast-changing values so async handlers (pauseJourney) can read the
  // latest post-await values instead of stale closure-captured ones. Updated every
  // render via the effect below.
  const officialDistanceRef = useRef<number>(0);
  const movingTimeRef = useRef<number>(0);
  const routePointsCurrentRef = useRef<RoutePoint[]>([]);

  const persistStartTime = useCallback(async (time: number) => {
    try {
      await AsyncStorage.setItem(JOURNEY_START_TIME_KEY, time.toString());
    } catch (e) {
      console.warn('[JourneyContext] Failed to persist startTime:', e);
    }
  }, []);

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

  const clearStartTime = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(JOURNEY_START_TIME_KEY);
    } catch (e) {
      console.warn('[JourneyContext] Failed to clear startTime:', e);
    }
  }, []);

  useEffect(() => {
    // Always clear existing interval FIRST to prevent memory leak from multiple intervals
    // before any async operations
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

    let isCancelled = false;

    if (hasJourney) {
      const initializeTimer = async () => {
        let startTime: number;

        if (journeyState.myInstance?.startTime) {
          startTime = new Date(journeyState.myInstance.startTime).getTime();
        } else if (startTimeRef.current) {
          startTime = startTimeRef.current;
        } else {
          // Try to recover from AsyncStorage (app was restarted)
          const recovered = await recoverStartTime();
          if (isCancelled) return;

          if (recovered && journeyState.currentJourney?.id) {
            startTime = recovered;
            startTimeRef.current = recovered;
          } else {
            startTime = Date.now();
            startTimeRef.current = startTime;
            await persistStartTime(startTime);
            if (isCancelled) return;
          }
        }

        if (isCancelled) return;

        const now = Date.now();
        const elapsed = Math.max(0, Math.floor((now - startTime) / 1000));
        setLocalElapsedTime(elapsed);

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
      setLocalElapsedTime(0);
      if (!journeyState.myInstance?.startTime) {
        startTimeRef.current = null;
      }

      return () => {
        isCancelled = true;
      };
    }
  }, [journeyState.isTracking, journeyState.myInstance?.startTime, journeyState.currentJourney?.id, recoverStartTime, persistStartTime]);

  const derivedStats: JourneyStats = useMemo(() => {
    // When tracking: add pre-pause accumulated values to the current segment from useSmartTracking.
    // When paused:   use the last-dispatched Redux values (useSmartTracking resets to 0 on pause).
    const totalDist = journeyState.isTracking
      ? preResumeDistanceRef.current + officialDistance
      : statsFromStore.totalDistance;
    const totalMoving = journeyState.isTracking
      ? preResumeMovingTimeRef.current + movingTime
      : statsFromStore.movingTime;
    return {
      totalDistance: totalDist,
      totalTime: journeyState.isTracking && (journeyState.myInstance?.startTime || startTimeRef.current)
        ? localElapsedTime
        : statsFromStore.totalTime,
      movingTime: totalMoving,
      // Recalculate avgSpeed from totals (not just current segment)
      avgSpeed: totalMoving > 0 ? (totalDist / totalMoving) * 3600 : 0,
      topSpeed: maxSpeed,
      currentSpeed: liveRawLocation?.speed ? liveRawLocation.speed * 3.6 : 0,
    };
  }, [statsFromStore, officialDistance, movingTime, maxSpeed, liveRawLocation, journeyState.myInstance, journeyState.isTracking, localElapsedTime]);

  // Async handlers (e.g. pauseJourney) read these refs post-await to avoid stale closures.
  useEffect(() => {
    officialDistanceRef.current = officialDistance;
    movingTimeRef.current = movingTime;
    routePointsCurrentRef.current = routePoints;
  });

  // Sync Smart Tracking stats to Redux Store (runs at GPS rate ~1 Hz — stats are cheap)
  useEffect(() => {
    if (!journeyState.isTracking) return;

    // Include pre-pause accumulated values so Redux always has the journey totals,
    // not just the current segment's output from useSmartTracking.
    const totalDist = preResumeDistanceRef.current + officialDistance;
    const totalMoving = preResumeMovingTimeRef.current + movingTime;
    dispatch(setStats({
      totalDistance: totalDist,
      totalTime: derivedStats.totalTime,
      movingTime: totalMoving,
      avgSpeed: totalMoving > 0 ? (totalDist / totalMoving) * 3600 : 0,
      topSpeed: maxSpeed,
      currentSpeed: derivedStats.currentSpeed,
    }));

  }, [officialDistance, movingTime, avgSpeed, maxSpeed, liveRawLocation, journeyState.isTracking, dispatch, derivedStats.totalTime, derivedStats.currentSpeed]);

  // Sync route points to Redux — ONLY when the snapped path itself changes (every ~8 s on flush),
  // NOT on every GPS location update. Previously this was merged with the stats effect above,
  // which caused up to 5 000-point arrays to be created and dispatched at 1 Hz, generating
  // heavy GC pressure that caused OOM crashes / ANR on long rides.
  useEffect(() => {
    if (!journeyState.isTracking) return;

    const newRoutePoints = officialSnappedPath.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: Date.now(),
      speed: 0,
      accuracy: 0,
      altitude: 0
    }));

    // Don't wipe Redux when useSmartTracking just reset (empty current segment + no bg gap +
    // existing baseline from a prior segment). Wait for new GPS to populate before dispatching.
    if (
      newRoutePoints.length === 0 &&
      bgMergedRoutePointsRef.current.length === 0 &&
      routePointsBaselineRef.current.length === 0
    ) {
      return;
    }

    // Prepend the baseline (routes from completed segments before the current one) so
    // resume-after-pause doesn't dispatch only the current segment's points and wipe history.
    // Background gap points (collected while app was suspended) go between baseline and the
    // new snap. After the first dispatch that includes them, the ref is cleared.
    const combined = [
      ...routePointsBaselineRef.current,
      ...bgMergedRoutePointsRef.current,
      ...newRoutePoints,
    ];
    bgMergedRoutePointsRef.current = [];
    dispatch(setRoutePoints(combined));

  }, [officialSnappedPath, journeyState.isTracking, dispatch]);

  // Foreground → Live Activity / Notification sync (iOS Live Activity + Android notification)
  const liveNotificationThrottleRef = useRef<number>(0);
  useEffect(() => {
    if (!journeyState.isTracking || !journeyState.currentJourney) return;

    // Throttle to every 3 seconds — Live Activity updates cross the native bridge
    const now = Date.now();
    if (now - liveNotificationThrottleRef.current < 3000) return;
    liveNotificationThrottleRef.current = now;

    const journey = journeyState.currentJourney;
    const currentStartTime = journeyState.myInstance?.startTime
      ? new Date(journeyState.myInstance.startTime).getTime()
      : startTimeRef.current || now;

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
      units: distanceUnit === 'mi' ? 'mi' : 'km',
      isPaused: journeyState.currentJourney?.status === 'paused',
    };

    LiveNotificationService.updateNotification(notificationData).catch(e => {
      console.warn('[JourneyContext] Live notification update failed:', e);
    });

    // Claim the foreground notification lease so the background task doesn't overwrite
    // our freshly-pushed values with its own (less-accurate) snapshot while the app is open.
    AsyncStorage.setItem('wayfarian.fgNotificationLeaseAt', String(now)).catch(() => {});

    // Background-state sync on suspend is handled by syncToBackgroundOnSuspend()
    // (called via the AppState 'background' handler). A redundant read-modify-write
    // of the full 175KB+ background JSON every 3s was causing severe GC pressure
    // on long rides and has been removed. The lease timestamp above is sufficient
    // to let the background task know the foreground is alive and to skip its own
    // (less accurate) notification update.
  }, [liveRawLocation, officialDistance, derivedStats.currentSpeed, avgSpeed, maxSpeed, movingTime, journeyState.isTracking, journeyState.currentJourney, journeyState.myInstance?.startTime, distanceUnit]);

  // Solo-journey backend location updates — group journeys use their own socket path
  const backendUpdateThrottleRef = useRef<number>(0);
  useEffect(() => {
    if (!journeyState.isTracking || !liveRawLocation || !journeyState.currentJourney) return;

    if (journeyState.currentJourney.groupJourneyId) return;

    // Throttle to every 5 seconds to avoid flooding the server
    const now = Date.now();
    if (now - backendUpdateThrottleRef.current < 5000) return;
    backendUpdateThrottleRef.current = now;

    const updateBackend = async () => {
       try {
         await journeyAPI.updateJourney(journeyState.currentJourney!.id, {
           currentLatitude: liveRawLocation.latitude,
           currentLongitude: liveRawLocation.longitude,
           currentSpeed: (liveRawLocation.speed ?? 0) * 3.6,
         });
       } catch (e) {
         console.warn('Backend update failed', e);
       }
    };

    updateBackend();

  }, [liveRawLocation, journeyState.isTracking, journeyState.currentJourney]);
  const JOURNEY_ID_KEY = 'active_journey_id';
  const GROUP_INSTANCE_ID_KEY = 'active_group_instance_id';

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

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastRecoveryRef = useRef<number>(0);
  // Route points collected by the background task while suspended — prepended to polyline on resume
  const bgMergedRoutePointsRef = useRef<RoutePoint[]>([]);

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

        if (!startTimeRef.current && backgroundState.startTime) {
          startTimeRef.current = backgroundState.startTime;
          await persistStartTime(backgroundState.startTime);
        }
        
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

            if (response.journey.startTime && !startTimeRef.current) {
              startTimeRef.current = new Date(response.journey.startTime).getTime();
              await persistStartTime(startTimeRef.current);
            }
          }
        } else {
          // We have currentJourney but may not be tracking — re-enable tracking ONLY if
          // the journey is in 'active' status. A 'paused' journey should stay paused
          // until the user explicitly hits Resume.
          if (!journeyState.isTracking && journeyState.currentJourney.status !== 'paused') {
            dispatch(setTracking(true));
          }
        }
      } else {
        // No background state — check for an orphaned journey from a previous process kill
        const persistedJourneyId = await AsyncStorage.getItem(JOURNEY_ID_KEY);

        if (persistedJourneyId && !journeyState.currentJourney) {
          console.log('[JourneyContext] Found orphaned journey ID:', persistedJourneyId);

          const response = await journeyAPI.getActiveJourney();
          if (response?.journey && response.journey.id === persistedJourneyId) {
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
                      await journeyAPI.endJourney(response.journey.id, {
                        totalDistance: response.journey.totalDistance || 0,
                      });
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
                      
                      if (response.journey.startTime) {
                        startTimeRef.current = new Date(response.journey.startTime).getTime();
                        await persistStartTime(startTimeRef.current);
                      }
                      
                      const isActive = await BackgroundTaskService.isBackgroundTrackingActive();
                      if (!isActive) {
                        await BackgroundTaskService.startBackgroundTracking(response.journey.id, {
                          vehicle: response.journey.vehicle,
                        });
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

  const syncToBackgroundOnSuspend = useCallback(async () => {
    if (!journeyState.isTracking || !journeyState.currentJourney) return;

    try {
      console.log('[JourneyContext] App going to background, syncing foreground state...');

      await BackgroundTaskService.syncForegroundToBackground({
        totalDistance: officialDistance,
        movingTime: movingTime,
        topSpeed: maxSpeed,
        currentSpeed: derivedStats.currentSpeed,
        currentLatitude: liveRawLocation?.latitude,
        currentLongitude: liveRawLocation?.longitude,
      });

      // Force immediate Live Activity / notification update (bypass throttle)
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
        units: distanceUnit === 'mi' ? 'mi' : 'km',
      };

      liveNotificationThrottleRef.current = 0;
      await LiveNotificationService.updateNotification(notificationData);
      console.log('[JourneyContext] Background sync complete');
    } catch (error) {
      console.error('[JourneyContext] Error syncing to background:', error);
    }
  }, [journeyState.isTracking, journeyState.currentJourney, journeyState.myInstance?.startTime,
      officialDistance, movingTime, maxSpeed, avgSpeed, derivedStats.currentSpeed, liveRawLocation, distanceUnit]);

  const mergeBackgroundStateOnForeground = useCallback(async () => {
    if (!journeyState.isTracking || !journeyState.currentJourney) return;

    try {
      const bgState = await BackgroundTaskService.getBackgroundAccumulatedState();
      if (!bgState) return;

      console.log('[JourneyContext] Merging background state - BG distance:', bgState.totalDistance.toFixed(2),
        'FG distance:', officialDistance.toFixed(2));

      // If background tracked new points while suspended, store them so the next
      // Roads API snap flush can prepend them — this fills the polyline gap.
      if (bgState.totalDistance > officialDistance && bgState.routePoints.length > 1) {
        const gapPoints: RoutePoint[] = bgState.routePoints.map(p => ({
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.timestamp,
          speed: p.speed || 0,
          accuracy: 0,
          altitude: 0,
        }));
        bgMergedRoutePointsRef.current = gapPoints;
          // Will be replaced by next Roads API snap; this fills the visual gap immediately
        dispatch(setRoutePoints([...routePoints, ...gapPoints]));
      }

      liveNotificationThrottleRef.current = 0;
    } catch (error) {
      console.error('[JourneyContext] Error merging background state:', error);
    }
  }, [journeyState.isTracking, journeyState.currentJourney, officialDistance, routePoints, dispatch]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        syncToBackgroundOnSuspend();
      }

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

  // Full client cleanup when an admin ends the group journey from the server side
  useEffect(() => {
    const handleGroupJourneyCompleted = async (data: any) => {
      const activeGroupJourneyId = journeyState.currentJourney?.groupJourneyId || journeyState.myInstance?.groupJourneyId;
      if (!activeGroupJourneyId) return;
      if (data?.groupJourneyId !== activeGroupJourneyId) return;

      console.log('[JourneyContext] Group journey ended externally, cleaning up...');

      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));

      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }

      try { await BackgroundTaskService.stopBackgroundTracking(); } catch {}
      try { await LiveNotificationService.dismissNotification(); } catch {}

      await clearStartTime();
      await AsyncStorage.removeItem(JOURNEY_ID_KEY).catch(() => {});
      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY).catch(() => {});

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

        // Parallel fetch avoids a race where one resolves and dispatches before the other
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

            // After a crash/process-kill the background task is also dead — re-arm so
            // the journey survives the next backgrounding.
            const bgAlreadyRunning = await BackgroundTaskService.isBackgroundTrackingActive().catch(() => false);
            if (!bgAlreadyRunning) {
              const { status: bgPerm } = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
              if (bgPerm === 'granted') {
                BackgroundTaskService.startBackgroundTracking(soloJourney.id, {
                  startTime: soloJourney.startTime ? new Date(soloJourney.startTime).getTime() : undefined,
                  vehicle: (soloJourney.vehicle as 'car' | 'bike' | 'scooter') || 'car',
                  startLocationName: soloJourney.startAddress || undefined,
                }).catch(e => console.warn('[JourneyContext] Background tracking restart on cold-start recovery failed:', e));
              }
            }
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

  /**
   * Requests location permissions, creates the journey on the server, and begins
   * GPS tracking. On Android, shows the Play-policy Background Location Disclosure
   * modal before requesting background permission if not already granted.
   * Returns `true` when tracking starts successfully; `false` when the caller should
   * wait (e.g. modal is shown) or if an unrecoverable error occurred.
   */
  const startJourney = async (journeyData: Partial<JourneyData>): Promise<boolean> => {
    try {
      // Clear stale journey state — prevents destination leaking from the previous journey
      dispatch(clearJourney());
      dispatch(setStats({
        totalDistance: 0, totalTime: 0, movingTime: 0,
        avgSpeed: 0, topSpeed: 0, currentSpeed: 0,
      }));
      dispatch(clearRoutePoints());
      preResumeDistanceRef.current = 0;
      preResumeMovingTimeRef.current = 0;
      routePointsBaselineRef.current = [];

      let { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        fgStatus = (await Location.requestForegroundPermissionsAsync()).status;
      }
      
      if (fgStatus !== 'granted') {
        throw new Error('Location permission denied');
      }

      // Android Background Location Policy Compliance.
      // Prominent Disclosure must be shown AFTER foreground permission but
      // BEFORE background location permission access.
      if (Platform.OS === 'android') {
        const DISCLOSURE_ACCEPTED_KEY = 'bg_location_disclosure_accepted_v1';
        const accepted = await AsyncStorage.getItem(DISCLOSURE_ACCEPTED_KEY);
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();

        if (bgStatus === 'granted') {
          // Background permission already granted — silently stamp acceptance if not yet
          // recorded (user may have granted via Settings before ever opening this flow).
          if (accepted !== '1') {
            AsyncStorage.setItem(DISCLOSURE_ACCEPTED_KEY, '1').catch(() => {});
          }
          // Check battery optimisation on this path too (the disclosure modal path
          // triggers its own check in onAccept; this covers the already-granted path).
          checkAndShowBatteryOptimization();
        } else if (accepted !== '1') {
          // First time needing background permission — show Play-policy disclosure first.
          setPendingJourneyData(journeyData);
          setShowLocationDisclosure(true);
          return false; // Modal handles permission request and re-invokes startJourney
        } else {
          // Disclosure previously accepted but bg permission now denied/revoked.
          // Direct the user to Settings — don't show the disclosure again.
          Alert.alert(
            'Permission Required',
            'Background location is required to track your journey accurately. Please enable it in Settings.',
          );
          return false;
        }
      }

      // Layered location strategy: cached GPS first (<10ms), Balanced accuracy fallback (1-3s).
      // Saves 5-20s vs the old BestForNavigation approach.
      let location: Location.LocationObject | null = null;
      try {
        location = await Location.getLastKnownPositionAsync();
      } catch {
        // fails silently on some devices
      }

      if (!location || (Date.now() - location.timestamp) > 60000) {
        // Cached position missing or >60s stale
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }

      let response: any;
      try {
        response = await journeyAPI.startJourney({
          vehicle: journeyData.vehicle || 'car',
          vehicleId: journeyData.vehicleId,
          vehicleName: journeyData.vehicleName,
          title: journeyData.title || 'My Journey',
          groupId: journeyData.groupId,
          startLatitude: location.coords.latitude,
          startLongitude: location.coords.longitude,
          ...(journeyData.endLocation ? {
            endLatitude: journeyData.endLocation.latitude,
            endLongitude: journeyData.endLocation.longitude,
            endAddress: journeyData.endLocation.address,
          } : {}),
        });
      } catch (apiError: any) {
        // 400 with activeJourney means the user already has a journey on the server
        if (apiError?.status === 400 && apiError?.body?.activeJourney?.id) {
          const staleJourney = apiError.body.activeJourney;
          const staleId = staleJourney.id;

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

            // Retry immediately — forward endLocation so the new journey has the correct
            // destination rather than falling back to stale Redux/backend data.
            response = await journeyAPI.startJourney({
              vehicle: journeyData.vehicle || 'car',
              vehicleId: journeyData.vehicleId,
              vehicleName: journeyData.vehicleName,
              title: journeyData.title || 'My Journey',
              groupId: journeyData.groupId,
              startLatitude: location.coords.latitude,
              startLongitude: location.coords.longitude,
              ...(journeyData.endLocation ? {
                endLatitude: journeyData.endLocation.latitude,
                endLongitude: journeyData.endLocation.longitude,
                endAddress: journeyData.endLocation.address,
              } : {}),
            });
          } else {
          let timeAgo = '';
          if (staleJourney.startTime) {
            const mins = Math.floor(staleElapsedMs / 60000);
            const hrs = Math.floor(mins / 60);
            timeAgo = hrs > 0 ? ` from ${hrs}h ${mins % 60}m ago` : ` from ${mins}m ago`;
          }

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

                const bgActive = await BackgroundTaskService.isBackgroundTrackingActive();
                if (!bgActive && isActive) {
                  BackgroundTaskService.startBackgroundTracking(journey.id, {
                    startTime: recoveredStartTime,
                    vehicle: journey.vehicle || 'car',
                  }).catch(() => {});
                }

                if (journey.groupId) {
                  ensureGroupJourneySocket(journey.groupId, dispatch).catch(() => {});
                }
              }
            } catch (e) {
              console.error('[JourneyContext] Error resuming existing journey:', e);
            }
            return true; // journey is active; callers navigate to journey screen
          }

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
          await BackgroundTaskService.stopBackgroundTracking().catch(() => {});
          try { await LiveNotificationService.dismissNotification(); } catch {}
          await clearStartTime();
          await AsyncStorage.removeItem(JOURNEY_ID_KEY).catch(() => {});
          await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY).catch(() => {});

          response = await journeyAPI.startJourney({
            vehicle: journeyData.vehicle || 'car',
            title: journeyData.title || 'My Journey',
            groupId: journeyData.groupId,
            startLatitude: location.coords.latitude,
            startLongitude: location.coords.longitude,
            ...(journeyData.endLocation ? {
              endLatitude: journeyData.endLocation.latitude,
              endLongitude: journeyData.endLocation.longitude,
              endAddress: journeyData.endLocation.address,
            } : {}),
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

      // Capture start time after async ops so the timer starts at ~0
      const startTimestamp = Date.now();
      
      const newJourney: JourneyData = {
        id: journeyId,
        title: journeyData.title || 'My Journey',
        startLocation: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            address: 'Start Location'
        },
        endLocation: journeyData.endLocation || undefined,
        groupId: journeyData.groupId,
        vehicle: journeyData.vehicle || 'car',
        status: 'active',
        photos: [],
      };

      // Update UI state first so the user sees the journey screen immediately
      dispatch(setCurrentJourney(newJourney));
      dispatch(setTracking(true));
      dispatch(setJourneyMinimized(false));
      startTimeRef.current = startTimestamp;

      // Fire non-blocking background work in parallel — none block the journey screen
      const backgroundWork: Promise<any>[] = [];

      backgroundWork.push(
        persistStartTime(startTimestamp).catch(e =>
          console.warn('[JourneyContext] persistStartTime failed:', e)
        )
      );

      if (journeyData.groupId) {
        backgroundWork.push(
          ensureGroupJourneySocket(journeyData.groupId, dispatch).catch(e =>
            console.warn('[JourneyContext] Group socket init failed:', e)
          )
        );
      }

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
          vehicle: (journeyData.vehicle as 'car' | 'bike' | 'scooter') || 'car',
        }).catch(err =>
          console.warn('[JourneyContext] Background tracking init failed (non-blocking):', err)
        )
      );

      Promise.all(backgroundWork).catch(() => {});

      return true;
    } catch (error) {
      console.error('Error starting journey:', error);
      return false;
    }
  };

  /** Persists a planned (PLANNED status) journey to the server without starting tracking. */
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

  /**
   * Pauses the current journey. Snapshots the accumulated distance and route points
   * from `useSmartTracking` into persistent refs so they survive the tracking reset
   * that occurs when tracking restarts on resume.
   */
  const pauseJourney = async () => {
    if (!journeyState.currentJourney) {
      console.warn('[JourneyContext] No journey to pause');
      return;
    }

    try {
      await journeyAPI.pauseJourney(journeyState.currentJourney.id);

      // Read the LATEST values via refs (closure-captured values are stale after
      // the await — GPS fires during the API call and updates state in the background).
      const segmentDist = officialDistanceRef.current;
      const segmentMoving = movingTimeRef.current;
      const baselineSnapshot = routePointsCurrentRef.current;

      // Stop tracking FIRST so the stats effect short-circuits (isTracking=false)
      // before we bump the refs — no risk of double-counting now.
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'paused' }));
      dispatch(setTracking(false));

      // Commit the segment totals. useSmartTracking will reset its internal state
      // on the next resume; these refs carry the journey totals forward.
      preResumeDistanceRef.current += segmentDist;
      preResumeMovingTimeRef.current += segmentMoving;
      routePointsBaselineRef.current = baselineSnapshot;
    } catch (error) {
      console.error('[JourneyContext] Error pausing journey:', error);
      throw error;
    }
  };

  /**
   * Resumes a paused journey. Re-arms the background task if it was killed by
   * device battery optimisation or a previous process kill.
   */
  const resumeJourney = async () => {
    if (!journeyState.currentJourney) {
      console.warn('[JourneyContext] No journey to resume');
      return;
    }
    try {
      await journeyAPI.resumeJourney(journeyState.currentJourney.id);
      dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'active' }));

      // Restart background task if it stopped (pause doesn't stop it, but it may have
      // died due to device battery optimisation or a previous process kill).
      BackgroundTaskService.isBackgroundTrackingActive()
        .then(bgActive => {
          if (!bgActive) {
            BackgroundTaskService.startBackgroundTracking(journeyState.currentJourney!.id, {
              vehicle: (journeyState.currentJourney!.vehicle as 'car' | 'bike' | 'scooter') || 'car',
              startTime: startTimeRef.current || undefined,
            }).catch(e => console.warn('[JourneyContext] BG tracking restart on resume failed:', e));
          }
        })
        .catch(() => {});

      dispatch(setTracking(true));
    } catch (error) {
      console.error('[JourneyContext] Error resuming journey:', error);
      throw error;
    }
  };

  /**
   * Attaches client-side tracking to an already-ACTIVE journey on the server.
   * Used by scheduled journeys that were created ahead of time.
   */
  const resumeActiveJourney = async (journeyId: string): Promise<boolean> => {
    try {
      console.log('[JourneyContext] Resuming active journey:', journeyId);

      const response = await journeyAPI.getJourney(journeyId);
      const journey = response?.journey;

      if (!journey) {
        console.error('[JourneyContext] Journey not found:', journeyId);
        return false;
      }

      if (journey.status !== 'ACTIVE') {
        console.warn('[JourneyContext] Journey is not ACTIVE:', journey.status);
        return false;
      }

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

      // Use current wall time — not the server-side creation time — so the timer starts at ~0
      const startTimestamp = Date.now();
      startTimeRef.current = startTimestamp;

      const backgroundWork: Promise<any>[] = [];

      backgroundWork.push(
        persistStartTime(startTimestamp).catch(e =>
          console.warn('[JourneyContext] persistStartTime failed:', e)
        )
      );

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

      backgroundWork.push(
        BackgroundTaskService.startBackgroundTracking(journeyId, {
          startLocationName: journey.startAddress || 'Start Location',
          destinationName: journey.endAddress,
          destinationLatitude: journey.endLatitude,
          destinationLongitude: journey.endLongitude,
          startTime: startTimestamp,
          vehicle: (journey.vehicle as 'car' | 'bike' | 'scooter') || 'car',
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

  /**
   * Ends the active journey, sends final stats to the server, stops background
   * tracking, dismisses the Live Activity / notification, and clears all local state.
   * Returns the journey ID for navigation to the detail screen, or `null` on failure.
   * Local state is always cleared even if the API call fails.
   */
  const endJourney = async (): Promise<string | null> => {
    try {
      if (!journeyState.currentJourney) {
        console.warn('No current journey to end');
        return null;
      }

      const journeyIdForNavigation = journeyState.currentJourney.id;

      // On Android, foreground state may not be fully synced when endJourney is called;
      // background service state is the authoritative fallback.
      const backgroundState = await BackgroundTaskService.getPersistedJourneyState();

      // Use the maximum of foreground and background stats to ensure accuracy.
      // When tracking: preResume(completed segments) + officialDistance(current segment).
      // When paused:   officialDistance still holds the pre-pause value (useSmartTracking
      //                only resets on false→true), so adding it would double-count.
      //                Use the Redux store value instead, which was last dispatched with
      //                the correct cumulative total at pause time.
      const foregroundDistance = journeyState.isTracking
        ? preResumeDistanceRef.current + officialDistance
        : statsFromStore.totalDistance;
      const backgroundDistance = backgroundState?.totalDistance || 0;
      const finalDistance = Math.max(foregroundDistance, backgroundDistance);

      console.log('[JourneyContext] End journey stats - Foreground:', foregroundDistance, 'Background:', backgroundDistance, 'Final:', finalDistance);

      let finalTotalTime: number;
      if (startTimeRef.current) {
        finalTotalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      } else if (backgroundState?.startTime) {
        finalTotalTime = Math.floor((Date.now() - backgroundState.startTime) / 1000);
      } else {
        finalTotalTime = localElapsedTime;
      }

      if (liveRawLocation) {
        await journeyAPI.updateJourney(journeyState.currentJourney.id, {
          latitude: liveRawLocation.latitude,
          longitude: liveRawLocation.longitude,
          speed: liveRawLocation.speed ? liveRawLocation.speed * 3.6 : 0,
        });
      }

      const endLocation = liveRawLocation
        ? { endLatitude: liveRawLocation.latitude, endLongitude: liveRawLocation.longitude }
        : {};

      await journeyAPI.endJourney(journeyState.currentJourney.id, {
        ...endLocation,
        totalDistance: finalDistance,
        totalTime: finalTotalTime,
        topSpeed: derivedStats.topSpeed,
        avgSpeed: derivedStats.avgSpeed,
      });

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

      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }

      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));

      await BackgroundTaskService.stopBackgroundTracking();

      try {
        await LiveNotificationService.dismissNotification();
      } catch (e) {
        console.warn('[JourneyContext] Failed to dismiss notification on end:', e);
      }

      await clearStartTime();
      await AsyncStorage.removeItem(JOURNEY_ID_KEY);
      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY);
      await AsyncStorage.removeItem('wayfarian.fgNotificationLeaseAt').catch(() => {});

      // Clear atomically — previously setting status='completed' first caused stale endLocation to persist
      dispatch(clearJourney());
      startTimeRef.current = null;
      preResumeDistanceRef.current = 0;
      preResumeMovingTimeRef.current = 0;
      routePointsBaselineRef.current = [];
      setLocalElapsedTime(0);

      // Purge persisted slice so stale endLocation doesn't re-appear on next cold start
      await AsyncStorage.removeItem('persist:journey').catch(() => {});

      return journeyIdForNavigation;
    } catch (error) {
      console.error('Error ending journey:', error);
      // Clear local state even on API failure — prevents stuck journey UI
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
      dispatch(setMyInstance(null));
      dispatch(setStats({
        totalDistance: 0, totalTime: 0, movingTime: 0,
        avgSpeed: 0, topSpeed: 0, currentSpeed: 0,
        activeMembersCount: 0, completedMembersCount: 0,
      }));
      dispatch(clearRoutePoints());
      dispatch(clearJourney());
      startTimeRef.current = null;
      preResumeDistanceRef.current = 0;
      preResumeMovingTimeRef.current = 0;
      routePointsBaselineRef.current = [];
      setLocalElapsedTime(0);
      await clearStartTime();
      await AsyncStorage.removeItem(JOURNEY_ID_KEY).catch(() => {});
      await AsyncStorage.removeItem(GROUP_INSTANCE_ID_KEY).catch(() => {});
      await AsyncStorage.removeItem('persist:journey').catch(() => {});
      await BackgroundTaskService.stopBackgroundTracking().catch(() => {});
      // Dismiss even on error — prevents zombie Live Activity / notification
      try {
        await LiveNotificationService.dismissNotification();
      } catch (e) {
        console.warn('[JourneyContext] Failed to dismiss notification on error:', e);
      }
      return null;
    }
  };

  /**
   * Emergency reset: stops all tracking services, force-clears the journey on the
   * server, and wipes all local state. Used when the UI is stuck in a broken state
   * (e.g. after a crash recovery that partially failed).
   */
  const clearStuckJourney = async () => {
    try {
      try {
        await locationService.endJourney();
      } catch (e) {
        console.warn('Location service endJourney failed:', e);
      }

      if (journeyState.currentJourney?.id) {
        try {
          await journeyAPI.forceClearJourney(journeyState.currentJourney.id);
        } catch (e) {
          console.warn('Force clear API call failed:', e);
        }
      }

      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }

      try {
        await AsyncStorage.multiRemove([
          'current_journey', 'journey_status', 'journey_start_time',
          'active_group_journey_id', 'active_journey_id', 'active_group_instance_id',
          'persist:journey',
        ]);
        await clearStartTime();
      } catch (e) {
        console.warn('AsyncStorage clear failed', e);
      }

      dispatch(clearJourney());
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));

      try {
        await BackgroundTaskService.stopBackgroundTracking();
      } catch (e) {
        console.warn('Failed to stop background tracking during clear:', e);
      }

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
      setLocalElapsedTime(0);
      startTimeRef.current = null;
      preResumeDistanceRef.current = 0;
      preResumeMovingTimeRef.current = 0;
      routePointsBaselineRef.current = [];

    } catch (error) {
      console.error('Error clearing stuck journey:', error);
      dispatch(clearJourney());
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
    }
  };

  /**
   * Uploads a photo to the active journey. Dispatches optimistic upload progress to
   * the Redux queue and, for group journeys, broadcasts a PHOTO event via the socket.
   */
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
        // Prefer liveRawLocation over routePoints — GPS buffer may not have flushed yet
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

  /** Ensures the group journey socket is connected and member presence is active. */
  const loadGroupMembers = useCallback(async (groupId: string) => {
    await ensureGroupJourneySocket(groupId, dispatch);
  }, [dispatch]);

  /** Merges a real-time location update for a group member into Redux. */
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
        heading: liveRawLocation.heading,
        altitude: 0
    } : null,
    resumeActiveJourney,
  };

  return (
    <>
      <JourneyContext.Provider value={value}>
        {children}
      </JourneyContext.Provider>

      <BackgroundLocationDisclosureModal
        visible={showLocationDisclosure}
        onAccept={async () => {
          // Capture synchronously before any await — state reads after awaits can
          // return stale values from a re-render triggered by setShowLocationDisclosure(false).
          const localPendingData = pendingJourneyData;
          setShowLocationDisclosure(false);
          setPendingJourneyData(null);

          try {
            await AsyncStorage.setItem('bg_location_disclosure_accepted_v1', '1');
          } catch {}

          let fgStatus = (await Location.getForegroundPermissionsAsync()).status;
          if (fgStatus !== 'granted') {
            const fgReq = await Location.requestForegroundPermissionsAsync();
            fgStatus = fgReq.status;
          }

          if (fgStatus === 'granted') {
            const bgCurrent = await Location.getBackgroundPermissionsAsync();
            let bgStatus = bgCurrent.status;
            if (bgStatus !== 'granted') {
              const bgReq = await Location.requestBackgroundPermissionsAsync();
              bgStatus = bgReq.status;
            }
            if (bgStatus === 'granted' && localPendingData) {
              startJourney(localPendingData);
              checkAndShowBatteryOptimization();
            } else if (bgStatus !== 'granted') {
              console.warn('[JourneyContext] Background location permission denied after disclosure');
              Alert.alert(
                'Permission Required',
                'Background location is required to track your journey accurately. Please enable it in Settings.'
              );
            }
          } else {
            Alert.alert(
              'Permission Required',
              'Foreground location permission is required to track your journey.'
            );
          }
        }}
        onDecline={() => {
          setShowLocationDisclosure(false);
          setPendingJourneyData(null);
        }}
      />

      <BatteryOptimizationModal
        visible={showBatteryModal}
        onDismiss={() => setShowBatteryModal(false)}
      />
    </>
  );
}

/**
 * Returns the current `JourneyContextType` value.
 * Must be called inside a `JourneyProvider` — throws otherwise.
 */
export function useJourney() {
  const context = useContext(JourneyContext);
  if (context === undefined) {
    throw new Error('useJourney must be used within a JourneyProvider');
  }
  return context;
}
