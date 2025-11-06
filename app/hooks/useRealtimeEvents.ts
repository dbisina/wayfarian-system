import { useState, useEffect, useCallback } from 'react';
import { connectSocket, joinGroupJourneyRoom, leaveGroupJourneyRoom, on as socketOn, off as socketOff } from '../services/socket';
import { apiRequest } from '../services/api';

export interface RideEvent {
  id: string;
  type: 'MESSAGE' | 'PHOTO' | 'CHECKPOINT' | 'STATUS' | 'EMERGENCY' | 'CUSTOM';
  message?: string;
  latitude?: number;
  longitude?: number;
  mediaUrl?: string;
  data?: any;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    photoURL?: string;
  };
}

interface UseRealtimeEventsOptions {
  groupJourneyId?: string;
  autoLoad?: boolean;
}

export function useRealtimeEvents(options: UseRealtimeEventsOptions) {
  const { groupJourneyId, autoLoad = true } = options;
  const [events, setEvents] = useState<RideEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial events from REST API
  const loadEvents = useCallback(async () => {
    if (!groupJourneyId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest(`/group-journey/${groupJourneyId}/events`, 'GET');
      if (res?.events) {
        setEvents(res.events);
      }
    } catch (err: any) {
      console.error('Load events error:', err);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [groupJourneyId]);

  // Post a new event via REST
  const postEvent = useCallback(async (payload: {
    type: RideEvent['type'];
    message?: string;
    latitude?: number;
    longitude?: number;
    mediaUrl?: string;
    data?: any;
  }) => {
    if (!groupJourneyId) return;
    try {
      await apiRequest(`/group-journey/${groupJourneyId}/events`, 'POST', payload);
      // Event will arrive via socket broadcast; no need to reload
    } catch (err) {
      console.error('Post event error:', err);
    }
  }, [groupJourneyId]);

  // Subscribe to live events
  useEffect(() => {
    if (!groupJourneyId) return;

    let mounted = true;

    (async () => {
      try {
        await connectSocket();
        await joinGroupJourneyRoom(groupJourneyId);

        const onEvent = (evt: any) => {
          if (!mounted || !evt) return;
          // Prepend new event (most recent first)
          setEvents((prev) => [evt, ...prev]);
        };

        socketOn('group-journey:event', onEvent);

        // Load initial events if autoLoad
        if (autoLoad && mounted) {
          await loadEvents();
        }

        return () => {
          mounted = false;
          try {
            socketOff('group-journey:event', onEvent);
            leaveGroupJourneyRoom(groupJourneyId);
          } catch {}
        };
      } catch (err) {
        console.error('useRealtimeEvents socket setup error:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [groupJourneyId, autoLoad, loadEvents]);

  return {
    events,
    loading,
    error,
    loadEvents,
    postEvent,
  };
}
