// app/contexts/JourneyContext.tsx
// Journey state management and real-time tracking

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { locationService, JourneyStats, LocationPoint } from '../services/locationService';
import { journeyAPI } from '../services/api';

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
  
  // Photo actions
  addPhoto: (photoUri: string) => Promise<void>;
  
  // UI actions
  minimizeJourney: () => void;
  maximizeJourney: () => void;
  
  // Group actions
  loadGroupMembers: (groupId: string) => Promise<void>;
  updateMemberLocation: (memberId: string, location: LocationPoint) => void;
}

const JourneyContext = createContext<JourneyContextType | undefined>(undefined);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [currentJourney, setCurrentJourney] = useState<JourneyData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [stats, setStats] = useState<JourneyStats>({
    totalDistance: 0,
    totalTime: 0,
    avgSpeed: 0,
    topSpeed: 0,
    currentSpeed: 0,
  });
  const [routePoints, setRoutePoints] = useState<LocationPoint[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);

  // Update stats periodically when tracking
  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      const newStats = locationService.getStats();
      const newRoutePoints = locationService.getRoutePoints();
      
      setStats(newStats);
      setRoutePoints(newRoutePoints);
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [isTracking]);

  // Load active journey on component mount
  useEffect(() => {
    const loadActiveJourney = async () => {
      try {
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
    };

    loadActiveJourney();
  }, []);

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
      }
      
      setIsTracking(false);
      setStats({
        totalDistance: 0,
        totalTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
      });
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

  const addPhoto = async (photoUri: string) => {
    if (!currentJourney) return;

    try {
      // Here you would upload the photo to your backend
      // For now, we'll just add it to the local state
      const updatedJourney = {
        ...currentJourney,
        photos: [...currentJourney.photos, photoUri],
      };
      
      setCurrentJourney(updatedJourney);
      
      // TODO: Upload photo to backend with journey context
      console.log('Photo added to journey:', photoUri);
    } catch (error) {
      console.error('Error adding photo:', error);
    }
  };

  const minimizeJourney = () => {
    setIsMinimized(true);
  };

  const maximizeJourney = () => {
    setIsMinimized(false);
  };

  const loadGroupMembers = async (groupId: string) => {
    try {
      // TODO: Implement group members API call
      // For now, we'll use mock data
      const mockMembers: GroupMember[] = [
        {
          id: '1',
          displayName: 'Alice Johnson',
          photoURL: 'https://static.codia.ai/image/2025-09-26/byc45z4XPi.png',
          currentLocation: {
            latitude: 37.7849 + (Math.random() - 0.5) * 0.01,
            longitude: -122.4094 + (Math.random() - 0.5) * 0.01,
            timestamp: Date.now(),
          },
          isOnline: true,
        },
        {
          id: '2',
          displayName: 'Bob Smith',
          photoURL: 'https://static.codia.ai/image/2025-09-26/nNFdUZfheL.png',
          currentLocation: {
            latitude: 37.7849 + (Math.random() - 0.5) * 0.01,
            longitude: -122.4094 + (Math.random() - 0.5) * 0.01,
            timestamp: Date.now(),
          },
          isOnline: true,
        },
        {
          id: '3',
          displayName: 'Carol Wilson',
          photoURL: 'https://static.codia.ai/image/2025-09-26/yAQdwAryr1.png',
          currentLocation: {
            latitude: 37.7849 + (Math.random() - 0.5) * 0.01,
            longitude: -122.4094 + (Math.random() - 0.5) * 0.01,
            timestamp: Date.now(),
          },
          isOnline: false,
        },
      ];

      setGroupMembers(mockMembers);
      
      // Set up real-time location updates for online members
      // TODO: Implement WebSocket or polling for real-time updates
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
    addPhoto,
    minimizeJourney,
    maximizeJourney,
    loadGroupMembers,
    updateMemberLocation,
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