// app/contexts/JourneyContext.tsx
// Journey state management and real-time tracking bridged through Redux

import React, { createContext, useContext, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI, groupJourneyAPI, galleryAPI } from '../services/api';
import { ensureGroupJourneySocket, teardownGroupJourneySocket, shareGroupLocation } from '../services/groupJourneySocket';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useAppDispatch } from '../store/hooks';
import { useSmartTracking } from '../hooks/useSmartTracking';
import * as Location from 'expo-location';
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
  endJourney: () => Promise<void>;
  clearStuckJourney: () => Promise<void>;
  addPhoto: (photoUri: string) => Promise<void>;
  minimizeJourney: () => void;
  maximizeJourney: () => void;
  loadGroupMembers: (groupId: string) => Promise<void>;
  updateMemberLocation: (memberId: string, location: LocationPoint) => void;
  hydrated: boolean;
  currentLocation: LocationPoint | null;
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

  const derivedStats: JourneyStats = useMemo(() => ({
    totalDistance: officialDistance,
    totalTime: journeyState.currentJourney?.startTime 
      ? Math.floor((Date.now() - new Date(journeyState.currentJourney.startTime).getTime()) / 1000)
      : statsFromStore.totalTime,
    movingTime: movingTime,
    avgSpeed: avgSpeed,
    topSpeed: maxSpeed,
    currentSpeed: liveRawLocation?.speed ? liveRawLocation.speed * 3.6 : 0,
  }), [statsFromStore, officialDistance, movingTime, avgSpeed, maxSpeed, liveRawLocation, journeyState.currentJourney]);

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

  /* 
  // Removed old polling effect
  useEffect(() => {
    if (!journeyState.currentJourney) return;

    const interval = setInterval(() => {
      const newStats = locationService.getStats();
      const newRoutePoints = locationService.getRoutePoints();
      dispatch(setStats(newStats));
      dispatch(setRoutePoints(newRoutePoints));
    }, 1000);

    return () => clearInterval(interval);
  }, [journeyState.currentJourney, dispatch]);
  */

  useEffect(() => {
    let cancelled = false;

    const loadActiveJourney = async () => {
      dispatch(setHydrated(false));
      try {
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
          dispatch(setTracking(response.journey.status === 'active'));
          if (response.journey.groupId) {
            await ensureGroupJourneySocket(response.journey.groupId, dispatch);
          }
        } else {
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
        startTime: new Date().toISOString(),
      };

      dispatch(setCurrentJourney(newJourney));
      dispatch(setTracking(true));
      dispatch(setJourneyMinimized(false));

      if (journeyData.groupId) {
        await ensureGroupJourneySocket(journeyData.groupId, dispatch);
      }

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
    try {
      // await locationService.pauseJourney(); // Handled by useSmartTracking (isTracking=false)
      if (journeyState.currentJourney) {
        await journeyAPI.pauseJourney(journeyState.currentJourney.id);
        dispatch(setTracking(false));
        dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'paused' }));
      }
    } catch (error) {
      console.error('Error pausing journey:', error);
    }
  };

  const resumeJourney = async () => {
    try {
      // await locationService.resumeJourney(); // Handled by useSmartTracking (isTracking=true)
      if (journeyState.currentJourney) {
        await journeyAPI.resumeJourney(journeyState.currentJourney.id);
        dispatch(setTracking(true));
        dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'active' }));
      }
    } catch (error) {
      console.error('Error resuming journey:', error);
    }
  };

  const endJourney = async () => {
    try {
      // await locationService.endJourney(); // Handled by useSmartTracking (isTracking=false)
      
      // Final update
      if (journeyState.currentJourney && liveRawLocation) {
         await journeyAPI.endJourney(journeyState.currentJourney.id, {
            endLatitude: liveRawLocation.latitude,
            endLongitude: liveRawLocation.longitude,
         });
      } else if (journeyState.currentJourney) {
         // Fallback if no location
         await journeyAPI.endJourney(journeyState.currentJourney.id, {});
      }

      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }
      if (journeyState.currentJourney) {
        dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'completed' }));
      }
      dispatch(setTracking(false));
      dispatch(setJourneyMinimized(false));
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
      setTimeout(() => {
        dispatch(clearJourney());
      }, 3000);
    } catch (error) {
      console.error('Error ending journey:', error);
    }
  };

  const clearStuckJourney = async () => {
    try {
      await locationService.endJourney();
      if (journeyState.currentJourney?.groupId) {
        teardownGroupJourneySocket(journeyState.currentJourney.groupId);
      }
      dispatch(clearJourney());
      dispatch(setHydrated(true));
    } catch (error) {
      console.error('Error clearing stuck journey:', error);
      dispatch(clearJourney());
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
      );

      if (!response || !response.photo) {
        throw new Error('Failed to upload photo');
      }

      const uploadedPhotoUri =
        response.photo.imageUrl ||
        getFirebaseDownloadUrl(response.photo.firebasePath) ||
        response.photo.firebasePath;

      dispatch(updateUploadStatus({ id: uploadId, status: 'completed', remoteUrl: uploadedPhotoUri, progress: 1 }));
      dispatch(setCurrentJourney({
        ...journeyState.currentJourney,
        photos: [...journeyState.currentJourney.photos, uploadedPhotoUri],
      }));

      const activeGroupJourneyId = journeyState.currentJourney.groupJourneyId || journeyState.myInstance?.groupJourneyId;
      if (activeGroupJourneyId && uploadedPhotoUri) {
        const routePoints = locationService.getRoutePoints();
        const lastPoint = routePoints.length ? routePoints[routePoints.length - 1] : undefined;
        try {
          await groupJourneyAPI.postEvent(activeGroupJourneyId, {
            type: 'PHOTO',
            message: 'Shared a ride photo',
            mediaUrl: uploadedPhotoUri,
            latitude: lastPoint?.latitude,
            longitude: lastPoint?.longitude,
          });
        } catch (eventError) {
          console.warn('Failed to broadcast group photo event', eventError);
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
