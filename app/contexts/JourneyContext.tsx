// app/contexts/JourneyContext.tsx
// Journey state management and real-time tracking

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI, groupJourneyAPI } from '../services/api';
import { connectSocket, joinGroupRoom, requestGroupLocations, on as socketOn, off as socketOff, leaveGroupRoom } from '../services/socket';
import { getFirebaseDownloadUrl } from '../utils/storage';

export interface JourneyData {
  id: string;
  title: string;
  startLocation?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  endLocation?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  groupId?: string;
  groupJourneyId?: string; // if this JourneyData represents a group journey context
  vehicle?: string;
  status: 'not-started' | 'active' | 'paused' | 'completed';
  photos: string[];
}

export interface GroupMember {
  id: string;
  displayName: string;
  photoURL?: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
  isOnline: boolean;
}

interface JourneyContextType {
  // Journey state
  currentJourney: JourneyData | null;
  isTracking: boolean;
  isMinimized: boolean;
  stats: JourneyStats;
  routePoints: LocationPoint[];
  groupMembers: GroupMember[];
  
  // Journey actions
  startJourney: (journeyData: Partial<JourneyData>) => Promise<boolean>;
  pauseJourney: () => Promise<void>;
  resumeJourney: () => Promise<void>;
  endJourney: () => Promise<void>;
  clearStuckJourney: () => Promise<void>; // Force clear any stuck journey
  
  // Photo actions
  addPhoto: (photoUri: string) => Promise<void>;
  
  // UI actions
  minimizeJourney: () => void;
  maximizeJourney: () => void;
  
  // Group actions
  loadGroupMembers: (groupId: string) => Promise<void>;
  updateMemberLocation: (memberId: string, location: LocationPoint) => void;
  hydrated: boolean;
}

const JourneyContext = createContext<JourneyContextType | undefined>(undefined);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [currentJourney, setCurrentJourney] = useState<JourneyData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [stats, setStats] = useState<JourneyStats>({
    totalDistance: 0,
    totalTime: 0,
    movingTime: 0,
    avgSpeed: 0,
    topSpeed: 0,
    currentSpeed: 0,
  });
  const [routePoints, setRoutePoints] = useState<LocationPoint[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);

  // Update stats periodically when journey exists (even if paused/minimized)
  // This keeps the timer ticking and UI responsive
  useEffect(() => {
    // Only update if there's an active or paused journey
    if (!currentJourney) return;

    const interval = setInterval(() => {
      const newStats = locationService.getStats();
      const newRoutePoints = locationService.getRoutePoints();
      
      setStats(newStats);
      setRoutePoints(newRoutePoints);
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [currentJourney]); // Depend on journey existence, not tracking state

  // Load active journey on component mount
  useEffect(() => {
    const loadActiveJourney = async () => {
      const CACHE_KEY = 'cachedMyGroupInstance';
      const AUTO_PAUSE_ON_BOOT = (process.env.EXPO_PUBLIC_AUTOPAUSE_ON_BOOT === 'true');
      let restoredFromCache = false;
      try {
        // 0) If we have a cached group instance, restore it first (offline-first UX)
        try {
          const cached = await AsyncStorage.getItem(CACHE_KEY);
          if (cached) {
            const inst = JSON.parse(cached);
            if (inst && inst.id) {
              setCurrentJourney({
                id: inst.id,
                title: inst.groupJourney?.title || 'Group Ride',
                groupId: inst.groupJourney?.groupId || inst.groupId,
                groupJourneyId: inst.groupJourney?.id || inst.groupJourneyId,
                status: 'paused',
                photos: [],
              });
              setIsTracking(false);
              setIsMinimized(true);
              const gid = inst.groupJourney?.groupId || inst.groupId;
              if (gid) {
                loadGroupMembers(gid);
              }
              restoredFromCache = true;
            }
          }
        } catch {}

        const response = await journeyAPI.getActiveJourney();
        // Check if response is valid and has journey data
        if (response && response.journey) {
          setCurrentJourney({
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
            status: response.journey.status,
            photos: response.journey.photos || [],
          });
          
          setIsTracking(response.journey.status === 'active');
          
          if (response.journey.groupId) {
            loadGroupMembers(response.journey.groupId);
          }
        } else {
          console.log('No active journey found or backend unavailable');
        }
      } catch (error) {
        console.error('Error loading active journey (backend may be unavailable):', error);
        // Don't treat this as a fatal error - app should work without backend
      }

      // Additionally: check for a user-scoped group instance (ACTIVE or PAUSED)
      try {
        const myInst = await groupJourneyAPI.getMyActiveInstance();
        const inst = myInst?.instance || myInst?.myInstance || myInst?.data || myInst?.journeyInstance;
  if (inst && (inst.status === 'ACTIVE' || inst.status === 'PAUSED')) {
          // Optional: auto-pause on boot if ACTIVE to keep UX consistent across devices
          if (inst.status === 'ACTIVE' && AUTO_PAUSE_ON_BOOT && inst.id) {
            try {
              await groupJourneyAPI.pauseInstance(inst.id);
              inst.status = 'PAUSED';
            } catch {}
          }

          // Restore a lightweight paused view on app boot. We intentionally DO NOT auto-resume tracking.
          setCurrentJourney({
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
            status: 'paused', // show paused overlay on restore
            photos: inst.photos || [],
          });

          // Ensure we are not actively tracking until user explicitly resumes
          setIsTracking(false);
          setIsMinimized(true);

          if (inst.groupId || inst.groupJourney?.groupId) {
            // Seed member list for map UI
            loadGroupMembers(inst.groupId || inst.groupJourney?.groupId);
          }

          // Persist to cache for offline restore
          try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(inst)); } catch {}
        } else {
          // No active instance on server; clear cache to avoid stale restores
          try { await AsyncStorage.removeItem(CACHE_KEY); } catch {}
          // If the overlay was restored from cache and there's no server instance, hide it
          if (restoredFromCache) {
            setCurrentJourney(prev => {
              if (prev?.groupJourneyId && prev.status === 'paused' && !isTracking) {
                return null;
              }
              return prev;
            });
            setIsMinimized(false);
          }
        }
      } catch {
        // Non-fatal if this endpoint or network is unavailable
      }
      // Mark hydration complete to allow UI like overlays to render only after verification
      setHydrated(true);
    };

    loadActiveJourney();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startJourney = async (journeyData: Partial<JourneyData>): Promise<boolean> => {
    try {
      // Start journey with backend only (no offline fallback)
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

      setCurrentJourney(newJourney);
      setIsTracking(true);
      
      if (journeyData.groupId) {
        loadGroupMembers(journeyData.groupId);
      }

      return true;
    } catch (error) {
      console.error('Error starting journey:', error);
      return false;
    }
  };

  const pauseJourney = async () => {
    try {
      await locationService.pauseJourney();
      setIsTracking(false);
      
      if (currentJourney) {
        setCurrentJourney({ ...currentJourney, status: 'paused' });
      }
    } catch (error) {
      console.error('Error pausing journey:', error);
    }
  };

  const resumeJourney = async () => {
    try {
      await locationService.resumeJourney();
      setIsTracking(true);
      
      if (currentJourney) {
        setCurrentJourney({ ...currentJourney, status: 'active' });
      }
    } catch (error) {
      console.error('Error resuming journey:', error);
    }
  };

  const endJourney = async () => {
    try {
      await locationService.endJourney();
      
      if (currentJourney) {
        setCurrentJourney({ ...currentJourney, status: 'completed' });
        if (currentJourney.groupId) {
          try { leaveGroupRoom(currentJourney.groupId); } catch {}
        }
      }
      setIsTracking(false);
      setStats({
        totalDistance: 0,
        totalTime: 0,
        movingTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
      });
      setRoutePoints([]);
      setRoutePoints([]);
      setGroupMembers([]);
      
      // Clear current journey after a short delay to allow final stats display
      setTimeout(() => {
        setCurrentJourney(null);
      }, 3000);
    } catch (error) {
      console.error('Error ending journey:', error);
    }
  };

  // Force clear any stuck journey - useful for debugging or when journey gets stuck
  const clearStuckJourney = async () => {
    try {
      console.log('Force clearing stuck journey...');
      
      // Try to force-delete the journey in the backend if we have a journey ID
      if (currentJourney?.id) {
        try {
          console.log('Attempting to force-clear journey in backend:', currentJourney.id);
          
          // Use the force-clear endpoint that deletes regardless of status
          await journeyAPI.forceClearJourney(currentJourney.id);
          console.log('Journey force-cleared in backend successfully');
        } catch (apiError: any) {
          console.error('Failed to force-clear journey in backend:', apiError);
          
          // If force-clear fails, try the normal end endpoint as fallback
          try {
            console.log('Attempting normal end as fallback...');
            await journeyAPI.endJourney(currentJourney.id, {
              latitude: 0,
              longitude: 0,
            });
            console.log('Journey ended via fallback');
          } catch (endError) {
            console.error('Both force-clear and end failed, continuing with local clear:', endError);
          }
        }
      }
      
      // Stop location tracking
      await locationService.endJourney();
      
      // Leave any group rooms
      if (currentJourney?.groupId) {
        try { 
          leaveGroupRoom(currentJourney.groupId); 
        } catch (e) {
          console.log('Error leaving group room:', e);
        }
      }
      
      // Clear all state immediately
      setIsMinimized(false);
      setStats({
        totalDistance: 0,
        totalTime: 0,
        movingTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
      });
      setRoutePoints([]);
      setGroupMembers([]);
      
      // Clear AsyncStorage
      await AsyncStorage.removeItem('currentJourney');
      
      console.log('Stuck journey cleared successfully');
    } catch (error) {
      console.error('Error clearing stuck journey:', error);
      // Force clear anyway
      setCurrentJourney(null);
      setIsTracking(false);
      setIsMinimized(false);
      await AsyncStorage.removeItem('currentJourney').catch(() => {});
    }
  };

  const addPhoto = async (photoUri: string) => {
    if (!currentJourney) {
      throw new Error('No active journey');
    }

    try {
      // Create FormData for photo upload
      const formData = new FormData();
      
      // Extract filename from URI
      const filename = photoUri.split('/').pop() || 'photo.jpg';
      const fileType = filename.split('.').pop() || 'jpg';
      
      // Append photo file
      formData.append('photo', {
        uri: photoUri,
        name: filename,
        type: `image/${fileType}`,
      } as any);
      
      // Append journey context
      formData.append('journeyId', currentJourney.id);
      
      // Upload to backend
      const { galleryAPI } = await import('../services/api');
      const response = await galleryAPI.uploadPhoto(formData);
      
      if (!response || !response.photo) {
        throw new Error('Failed to upload photo');
      }
      
      // Add uploaded photo to local state
      const uploadedPhotoUri =
        response.photo.imageUrl ||
        getFirebaseDownloadUrl(response.photo.firebasePath) ||
        response.photo.firebasePath;

      const updatedJourney = {
        ...currentJourney,
        photos: [...currentJourney.photos, uploadedPhotoUri],
      };
      
      setCurrentJourney(updatedJourney);
      
      console.log('Photo uploaded successfully:', uploadedPhotoUri);
      return response.photo;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  };

  const minimizeJourney = () => {
    setIsMinimized(true);
  };

  const maximizeJourney = () => {
    setIsMinimized(false);
  };

  const loadGroupMembers = async (groupId: string): Promise<void> => {
    try {
      // Connect socket and join group room
      await connectSocket();
      await joinGroupRoom(groupId);

      // Seed with current server-side data
      const { groupAPI } = await import('../services/api');
      const groupRes = await groupAPI.getGroup(groupId);
      const membersFromGroup = groupRes?.group?.members || [];
      const activeJourneys = groupRes?.group?.journeys || [];

      const lastPointByUser: Record<string, { latitude: number; longitude: number; timestamp: number }> = {};
      activeJourneys.forEach((j: any) => {
        const points = j.routePoints || [];
        const last = points[points.length - 1];
        if (last) {
          lastPointByUser[j.userId] = {
            latitude: last.lat,
            longitude: last.lng,
            timestamp: new Date(last.timestamp).getTime(),
          };
        }
      });

      const normalized: GroupMember[] = membersFromGroup.map((m: any) => ({
        id: m.user.id,
        displayName: m.user.displayName || 'Member',
        photoURL: m.user.photoURL,
        currentLocation: (m.lastLatitude && m.lastLongitude)
          ? { latitude: m.lastLatitude, longitude: m.lastLongitude, timestamp: new Date(m.lastSeen || Date.now()).getTime() }
          : (lastPointByUser[m.user.id]
              ? { ...lastPointByUser[m.user.id] }
              : undefined),
        isOnline: !!m.isOnline,
      }));

      setGroupMembers(normalized);

      // Subscribe to live updates
  // Ensure previous listeners are cleared for fresh wiring
  socketOff('member-location-update');
  socketOff('member-joined');
  socketOff('member-left');
  socketOff('group-locations');

  const onLoc = (payload: any) => {
        const { userId, location } = payload || {};
        if (!userId || !location) return;
        updateMemberLocation(userId, {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date(location.timestamp || Date.now()).getTime(),
          speed: location.speed,
        });
      };
      const onJoined = (payload: any) => {
        const { userId } = payload || {};
        if (!userId) return;
        setGroupMembers((prev) => {
          if (prev.some((m) => m.id === userId)) return prev;
          return [...prev, { id: userId, displayName: payload.displayName, photoURL: payload.photoURL, isOnline: true } as GroupMember];
        });
      };
      const onLeft = (payload: any) => {
        const { userId } = payload || {};
        if (!userId) return;
        setGroupMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, isOnline: false } : m)));
      };

      socketOn('member-location-update', onLoc);
      socketOn('member-joined', onJoined);
      socketOn('member-left', onLeft);

      // Request a fresh batch of locations
      requestGroupLocations(groupId);

      const onLocations = (payload: any) => {
        if (!payload?.locations) return;
        const map: Record<string, { latitude: number; longitude: number; timestamp: number }> = {};
        payload.locations.forEach((l: any) => {
          if (l?.userId && l.location) {
            map[l.userId] = {
              latitude: l.location.latitude,
              longitude: l.location.longitude,
              timestamp: new Date(l.location.lastSeen || Date.now()).getTime(),
            };
          }
        });
        setGroupMembers((prev) => prev.map((m) => (
          map[m.id] ? { ...m, currentLocation: map[m.id] } : m
        )));
      };
      socketOn('group-locations', onLocations);

      // No return; cleanup is handled on next call and on endJourney
    } catch (error) {
      console.error('Error loading group members:', error);
    }
  };

  const updateMemberLocation = (memberId: string, location: LocationPoint) => {
    setGroupMembers(prev => 
      prev.map(member => 
        member.id === memberId 
          ? { 
              ...member, 
              currentLocation: {
                latitude: location.latitude,
                longitude: location.longitude,
                timestamp: location.timestamp,
              }
            }
          : member
      )
    );
  };

  const value: JourneyContextType = {
    currentJourney,
    isTracking,
    isMinimized,
    stats,
    routePoints,
    groupMembers,
    startJourney,
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