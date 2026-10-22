// app/v2/usePresence.ts
// Connects the presence manager to a real socket for the lifetime of a screen.

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { getApiHostBase, getAuthToken } from '../services/api';
import { useLiveRide } from './hooks';
import { createPresence, type Presence, type RiderPosition } from './presence';

export function usePresence(groupRideId: string | undefined): RiderPosition[] {
  const { user } = useAuth();
  const live = useLiveRide();
  const [riders, setRiders] = useState<RiderPosition[]>([]);
  const presence = useRef<Presence | null>(null);

  useEffect(() => {
    if (!groupRideId || !user?.id) return;
    const socket = io(getApiHostBase(), {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelayMax: 10_000,
      // A function, so every reconnect gets a fresh token instead of the one from first connect.
      auth: (cb) => { void getAuthToken().then((token) => cb({ token })); },
    });
    const p = createPresence({ socket: socket as never, groupRideId, selfUserId: user.id, onChange: setRiders });
    presence.current = p;
    const timer = setInterval(() => p.prune(), 15_000);
    return () => { clearInterval(timer); p.dispose(); presence.current = null; setRiders([]); };
  }, [groupRideId, user?.id]);

  // Share our own position whenever the recorder accepts a new fix for this group ride.
  const fix = live?.lastFix;
  useEffect(() => {
    if (fix) presence.current?.sendPosition({ lat: fix.lat, lng: fix.lng, t: fix.t, speedMps: fix.speedMps, distanceM: live?.distanceM });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix]);

  return riders;
}
