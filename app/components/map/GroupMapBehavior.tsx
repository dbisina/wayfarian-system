/**
 * Custom hook that prevents "Zoom Wars" on a group-journey map — the problem
 * where auto-fit and user gestures fight each other for camera control.
 *
 * Strategy: track the timestamp of the last user interaction and suppress
 * auto-fit for AUTO_FIT_DELAY_MS after any gesture. When the user explicitly
 * calls recenterOnGroup the cooldown is reset so the fit fires immediately.
 *
 * @returns mapViewProps   - Spread onto <MapView> to wire up gesture detection.
 * @returns isUserInteracting - True while the user is actively panning/zooming.
 * @returns recenterOnGroup   - Imperatively re-fits the camera to all members.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import MapView, { Region } from 'react-native-maps';

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
  const interactionTimeoutRef = useRef<number | null>(null);
  // 10 s gives the user time to inspect the map before auto-fit reclaims control.
  const AUTO_FIT_DELAY_MS = 10000;

  const fitToGroup = useCallback(() => {
    if (!mapRef.current || !isGroupJourney) return;

    const points = [...members];
    if (currentUserLocation) {
      points.push({ ...currentUserLocation, id: 'me' });
    }

    if (points.length < 2) return;

    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [mapRef, members, currentUserLocation, isGroupJourney]);

  // Auto-fit whenever member positions change, but only after the interaction cooldown.
  useEffect(() => {
    if (isUserInteracting || !isGroupJourney) return;

    const now = Date.now();
    if (now - lastInteractionTime.current > AUTO_FIT_DELAY_MS) {
      fitToGroup();
    }
  }, [members, currentUserLocation, isUserInteracting, isGroupJourney, fitToGroup]);

  const onPanDrag = useCallback(() => {
    setIsUserInteracting(true);
    lastInteractionTime.current = Date.now();

    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
  }, []);

  const onRegionChangeComplete = useCallback((region: Region, { isGesture }: { isGesture: boolean }) => {
    if (isGesture) {
      setIsUserInteracting(true);
      lastInteractionTime.current = Date.now();

      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }

      interactionTimeoutRef.current = setTimeout(() => {
        setIsUserInteracting(false);
      }, AUTO_FIT_DELAY_MS);
    }
  }, []);

  const recenterOnGroup = useCallback(() => {
    setIsUserInteracting(false);
    // Reset to zero so the auto-fit effect fires on the very next member update.
    lastInteractionTime.current = 0;
    fitToGroup();
  }, [fitToGroup]);

  return {
    mapViewProps: {
      onPanDrag,
      onRegionChangeComplete,
      onTouchStart: onPanDrag,
    },
    isUserInteracting,
    recenterOnGroup,
  };
};
