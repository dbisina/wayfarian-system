// app/components/map/GroupMapBehavior.tsx
// Logic to handle "Zoom Wars" - preventing the map from jumping while the user is interacting.

import { useEffect, useRef, useState, useCallback } from 'react';
import MapView, { Region } from 'react-native-maps';
import { Platform } from 'react-native';

interface MemberLocation {
  latitude: number;
  longitude: number;
  id: string;
}

interface UseGroupMapBehaviorProps {
  mapRef: React.RefObject<MapView>;
  members: MemberLocation[];
  currentUserLocation?: { latitude: number; longitude: number } | null;
  isGroupJourney: boolean;
}

export const useGroupMapBehavior = ({
  mapRef,
  members,
  currentUserLocation,
  isGroupJourney,
}: UseGroupMapBehaviorProps) => {
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const lastInteractionTime = useRef<number>(0);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_FIT_DELAY_MS = 15000; // 15 seconds

  // Function to fit all members and current user
  const fitToGroup = useCallback(() => {
    if (!mapRef.current || !isGroupJourney) return;

    const points = [...members];
    if (currentUserLocation) {
      points.push({ ...currentUserLocation, id: 'me' });
    }

    if (points.length < 2) return; // Need at least 2 points to make a bound meaningful? Or just center on 1.

    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [mapRef, members, currentUserLocation, isGroupJourney]);

  // Effect: Auto-fit bounds if not interacting
  useEffect(() => {
    if (isUserInteracting || !isGroupJourney) return;

    // If enough time has passed since last interaction, update the camera
    const now = Date.now();
    if (now - lastInteractionTime.current > AUTO_FIT_DELAY_MS) {
      fitToGroup();
    }
  }, [members, currentUserLocation, isUserInteracting, isGroupJourney, fitToGroup]);

  // Handlers for MapView
  const onPanDrag = useCallback(() => {
    setIsUserInteracting(true);
    lastInteractionTime.current = Date.now();
    
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
  }, []);

  const onRegionChangeComplete = useCallback((region: Region) => {
    // When the user stops dragging, we start a timer to re-enable auto-fit
    lastInteractionTime.current = Date.now();
    
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }

    interactionTimeoutRef.current = setTimeout(() => {
      setIsUserInteracting(false);
      // Optionally trigger an immediate fit here
      // fitToGroup(); 
    }, AUTO_FIT_DELAY_MS);
  }, []);

  // Manual "Resume" function
  const recenterOnGroup = useCallback(() => {
    setIsUserInteracting(false);
    lastInteractionTime.current = 0; // Force immediate update eligibility
    fitToGroup();
  }, [fitToGroup]);

  return {
    mapViewProps: {
      onPanDrag,
      onRegionChangeComplete,
      // onTouchStart could also be used to detect start of interaction
      onTouchStart: onPanDrag, 
    },
    isUserInteracting,
    recenterOnGroup,
  };
};
