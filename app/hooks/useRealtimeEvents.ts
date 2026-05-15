import { useState, useEffect, useCallback } from 'react';
import { connectSocket, joinGroupJourneyRoom, leaveGroupJourneyRoom, on as socketOn, off as socketOff } from '../services/socket';
import { apiRequest } from '../services/api';

/** A single ride event as returned by the backend (chat message, photo, checkpoint, etc.). */
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
  /** ID of the group journey to subscribe to. No-op when undefined. */
  groupJourneyId?: string;
  /** When true (default), fetches the event history via REST on mount. */
  autoLoad?: boolean;
}

/**
 * Subscribes to live ride events for a group journey via WebSocket and
 * optionally pre-populates the list from the REST history endpoint.
 *
 * New events arrive via the `group-journey:event` socket broadcast and are
 * prepended to `events` without re-fetching history. Posting via `postEvent`
 * is fire-and-forget; the socket broadcast is the source of truth for display.
 *
 * @returns `{ events, loading, error, loadEvents, postEvent }`
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions) {
  const { groupJourneyId, autoLoad = true } = options;
  const [events, setEvents] = useState<RideEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetch the full event history from the REST API. */
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

  /**
   * Post a new event to the group journey.
   * The socket broadcast will update `events`; no manual reload needed.
   */
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
    } catch (err) {
      console.error('Post event error:', err);
    }
  }, [groupJourneyId]);

  useEffect(() => {
    if (!groupJourneyId) {
      return;
    }

    let isActive = true;
    let hasJoined = false;
    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      try {
        await connectSocket();
        await joinGroupJourneyRoom(groupJourneyId);
        hasJoined = true;

        const onEvent = (evt: any) => {
          if (!isActive || !evt) return;
          setEvents(prev => [evt, ...prev]);
        };

        socketOn('group-journey:event', onEvent);
        unsubscribe = () => socketOff('group-journey:event', onEvent);

        if (autoLoad && isActive) {
          await loadEvents();
        }
      } catch (err) {
        console.error('useRealtimeEvents socket setup error:', err);
      }
    };

    setup();

    return () => {
      isActive = false;
      if (unsubscribe) {
        unsubscribe();
      }
      if (hasJoined) {
        try {
          leaveGroupJourneyRoom(groupJourneyId);
        } catch {}
      }
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
