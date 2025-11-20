// app/contexts/JourneyContext.tsx
// Journey state management and real-time tracking bridged through Redux

import React, { createContext, useContext, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI, groupJourneyAPI, galleryAPI } from '../services/api';
import { ensureGroupJourneySocket, teardownGroupJourneySocket } from '../services/groupJourneySocket';
import { getFirebaseDownloadUrl } from '../utils/storage';
import { useAppDispatch } from '../store/hooks';
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

  const derivedStats: JourneyStats = useMemo(() => ({
    totalDistance: statsFromStore.totalDistance,
    totalTime: statsFromStore.totalTime,
    movingTime: statsFromStore.movingTime,
    avgSpeed: statsFromStore.avgSpeed,
    topSpeed: statsFromStore.topSpeed,
    currentSpeed: statsFromStore.currentSpeed,
  }), [statsFromStore]);

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
      const journeyId = await locationService.startJourney(
        journeyData.vehicle || 'car',
        journeyData.title || 'My Journey',
        journeyData.groupId
      );

      if (!journeyId) {
        throw new Error('Failed to start journey tracking');
      }

      const newJourney: JourneyData = {
        id: journeyId,
        title: journeyData.title || 'My Journey',
        startLocation: journeyData.startLocation,
        endLocation: journeyData.endLocation,
        groupId: journeyData.groupId,
        vehicle: journeyData.vehicle || 'car',
        status: 'active',
        photos: [],
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
      await locationService.pauseJourney();
      dispatch(setTracking(false));
      if (journeyState.currentJourney) {
        dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'paused' }));
      }
    } catch (error) {
      console.error('Error pausing journey:', error);
    }
  };

  const resumeJourney = async () => {
    try {
      await locationService.resumeJourney();
      dispatch(setTracking(true));
      if (journeyState.currentJourney) {
        dispatch(setCurrentJourney({ ...journeyState.currentJourney, status: 'active' }));
      }
    } catch (error) {
      console.error('Error resuming journey:', error);
    }
  };

  const endJourney = async () => {
    try {
      await locationService.endJourney();
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
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    try {
      dispatch(updateUploadStatus({ id: uploadId, status: 'uploading' }));
      const formData = new FormData();
      const filename = photoUri.split('/').pop() || 'photo.jpg';
      const fileType = filename.split('.').pop() || 'jpg';

      formData.append('photo', {
        uri: photoUri,
        name: filename,
        type: `image/${fileType}`,
      } as any);

      formData.append('journeyId', journeyState.currentJourney.id);
      const response = await galleryAPI.uploadPhoto(formData);

      if (!response || !response.photo) {
        throw new Error('Failed to upload photo');
      }

      const uploadedPhotoUri =
        response.photo.imageUrl ||
        getFirebaseDownloadUrl(response.photo.firebasePath) ||
        response.photo.firebasePath;

      dispatch(updateUploadStatus({ id: uploadId, status: 'completed', remoteUrl: uploadedPhotoUri }));
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
