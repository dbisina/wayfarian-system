// app/services/socket.ts
// Socket.io client for real-time group location sharing

import { io, Socket } from 'socket.io-client';
import { getAuthToken, getCurrentApiUrl } from './api';

let socket: Socket | null = null;
function computeBaseUrl(): string {
  // Prefer explicit socket URL, else derive from the same runtime API host
  const envSocket = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envSocket) {
    return envSocket.replace(/\/$/, '');
  }
  const apiUrl = getCurrentApiUrl();
  return apiUrl.replace(/\/?api\/?$/, '');
}

export async function connectSocket(): Promise<Socket> {
  if (socket && socket.connected) return socket;

  const token = await getAuthToken(); // Firebase idToken stored in AsyncStorage
  const url = computeBaseUrl();

  socket = io(url, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    auth: { token },
  });

  // Refresh token before each reconnection attempt to prevent stale token issues
  socket.on('reconnect_attempt', async () => {
    try {
      const freshToken = await getAuthToken();
      if (socket && freshToken) {
        socket.auth = { token: freshToken };
        console.log('[Socket] Refreshed auth token before reconnection');
      }
    } catch (error) {
      console.warn('[Socket] Failed to refresh token on reconnect:', error);
    }
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try { socket.disconnect(); } catch { }
    socket = null;
  }
}

export async function joinGroupRoom(groupId: string) {
  const s = socket || (await connectSocket());
  s.emit('join-group', { groupId });
}

export function leaveGroupRoom(groupId: string) {
  if (!socket) return;
  socket.emit('leave-group', { groupId });
}

export function shareGroupLocation(data: { latitude: number; longitude: number; speed?: number; heading?: number }) {
  if (!socket) return;
  socket.emit('share-location', data);
}

export function requestGroupLocations(groupId: string) {
  if (!socket) return;
  socket.emit('get-group-locations', { groupId });
}

export function on(event: string, handler: (...args: any[]) => void) {
  if (!socket) return;
  socket.on(event, handler);
}

export function off(event: string, handler?: (...args: any[]) => void) {
  if (!socket) return;
  if (handler) socket.off(event, handler);
  else socket.off(event);
}

// Group Journey room helpers and events
export async function joinGroupJourneyRoom(groupJourneyId: string) {
  const s = socket || (await connectSocket());
  s.emit('group-journey:join', { groupJourneyId });
}

export function leaveGroupJourneyRoom(groupJourneyId: string) {
  if (!socket) return;
  socket.emit('group-journey:leave', { groupJourneyId });
}

export function postGroupJourneyEvent(payload: {
  groupJourneyId: string;
  type: 'MESSAGE' | 'PHOTO' | 'CHECKPOINT' | 'STATUS' | 'EMERGENCY' | 'CUSTOM';
  message?: string;
  latitude?: number;
  longitude?: number;
  mediaUrl?: string;
  data?: any;
}) {
  if (!socket) return;
  socket.emit('group-journey:post-event', payload);
}
