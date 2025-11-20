// app/services/groupJourneySocket.ts
// Centralized socket lifecycle for group journey updates

import type { AppDispatch } from '../store';
import {
  addEvent,
  mergeMemberLocation,
  memberCompleted,
  memberStarted,
  setGroupMembers,
  setMemberOnlineStatus,
  upsertGroupMember,
  type GroupMember,
} from '../store/slices/journeySlice';
import { groupAPI } from './api';
import {
  connectSocket,
  joinGroupRoom,
  leaveGroupRoom,
  requestGroupLocations,
  on as socketOn,
  off as socketOff,
} from './socket';

interface SocketListener {
  event: string;
  handler: (...args: any[]) => void;
}

let activeGroupId: string | null = null;
let listeners: SocketListener[] = [];

function buildMemberFromPayload(payload: any): GroupMember {
  return {
    id: payload?.userId || payload?.id,
    displayName: payload?.displayName || payload?.username || 'Member',
    photoURL: payload?.photoURL,
    isOnline: true,
    currentLocation: payload?.location
      ? {
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
          timestamp: new Date(payload.location.timestamp || Date.now()).getTime(),
          speed: payload.location.speed,
          heading: payload.location.heading,
        }
      : undefined,
  };
}

async function seedGroupMembers(groupId: string, dispatch: AppDispatch) {
  try {
    const groupRes = await groupAPI.getGroup(groupId);
    const membersFromGroup = groupRes?.group?.members || [];
    const activeJourneys = groupRes?.group?.journeys || [];

    const lastPointByUser: Record<string, { latitude: number; longitude: number; timestamp: number }> = {};
    activeJourneys.forEach((journey: any) => {
      const points = journey.routePoints || [];
      const lastPoint = points[points.length - 1];
      if (lastPoint) {
        lastPointByUser[journey.userId] = {
          latitude: lastPoint.lat ?? lastPoint.latitude,
          longitude: lastPoint.lng ?? lastPoint.longitude,
          timestamp: new Date(lastPoint.timestamp || Date.now()).getTime(),
        };
      }
    });

    const normalized: GroupMember[] = membersFromGroup.map((member: any) => {
      const location = member.lastLatitude && member.lastLongitude
        ? {
            latitude: member.lastLatitude,
            longitude: member.lastLongitude,
            timestamp: new Date(member.lastSeen || Date.now()).getTime(),
            speed: member.lastSpeed,
          }
        : lastPointByUser[member.user?.id || member.userId];

      return {
        id: member.user?.id || member.userId,
        displayName: member.user?.displayName || 'Member',
        photoURL: member.user?.photoURL,
        isOnline: !!member.isOnline,
        currentLocation: location,
      };
    });

    dispatch(setGroupMembers(normalized));

    normalized.forEach((member) => {
      if (member.currentLocation) {
        dispatch(mergeMemberLocation({
          userId: member.id,
          latitude: member.currentLocation.latitude,
          longitude: member.currentLocation.longitude,
          lastUpdate: new Date(member.currentLocation.timestamp).toISOString(),
          displayName: member.displayName,
          photoURL: member.photoURL,
        }));
      }
    });
  } catch (error) {
    console.error('[groupJourneySocket] Failed to seed group members', error);
  }
}

function bindSocketListeners(dispatch: AppDispatch) {
  teardownListeners();

  const handleMemberLocation = (payload: any) => {
    if (!payload?.userId || !payload?.location) return;
    dispatch(mergeMemberLocation({
      userId: payload.userId,
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
      speed: payload.location.speed,
      heading: payload.location.heading,
      lastUpdate: new Date(payload.location.timestamp || Date.now()).toISOString(),
      displayName: payload.displayName,
      photoURL: payload.photoURL,
    }));
  };

  const handleMemberJoined = (payload: any) => {
    if (!payload?.userId) return;
    dispatch(upsertGroupMember(buildMemberFromPayload(payload)));
  };

  const handleMemberLeft = (payload: any) => {
    if (!payload?.userId) return;
    dispatch(setMemberOnlineStatus({ userId: payload.userId, isOnline: false }));
  };

  const handleGroupLocations = (payload: any) => {
    if (!payload?.locations) return;
    payload.locations.forEach((entry: any) => {
      if (!entry?.userId || !entry?.location) return;
      dispatch(mergeMemberLocation({
        userId: entry.userId,
        latitude: entry.location.latitude,
        longitude: entry.location.longitude,
        speed: entry.location.speed,
        heading: entry.location.heading,
        lastUpdate: entry.location.lastSeen,
        displayName: entry.displayName,
        photoURL: entry.photoURL,
      }));
    });
  };

  const handleMemberStarted = (payload: any) => {
    if (payload?.instance) {
      dispatch(memberStarted(payload.instance));
    }
  };

  const handleMemberCompleted = (payload: any) => {
    if (payload?.instance && payload?.userId) {
      dispatch(memberCompleted({ userId: payload.userId, instance: payload.instance }));
    }
  };

  const handleRideEvent = (payload: any) => {
    if (!payload?.id) return;
    dispatch(addEvent({
      id: payload.id,
      type: payload.type || 'CUSTOM',
      userId: payload.userId,
      username: payload.username,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      data: payload.data,
    }));
  };

  listeners = [
    { event: 'member-location-update', handler: handleMemberLocation },
    { event: 'member-joined', handler: handleMemberJoined },
    { event: 'member-left', handler: handleMemberLeft },
    { event: 'group-locations', handler: handleGroupLocations },
    { event: 'member-started', handler: handleMemberStarted },
    { event: 'member-completed', handler: handleMemberCompleted },
    { event: 'ride-event', handler: handleRideEvent },
  ];

  listeners.forEach(({ event, handler }) => socketOn(event, handler));
}

function teardownListeners() {
  listeners.forEach(({ event, handler }) => socketOff(event, handler));
  listeners = [];
}

export async function ensureGroupJourneySocket(groupId: string, dispatch: AppDispatch) {
  await connectSocket();

  if (activeGroupId && activeGroupId !== groupId) {
    leaveGroupRoom(activeGroupId);
  }

  await joinGroupRoom(groupId);
  await seedGroupMembers(groupId, dispatch);
  bindSocketListeners(dispatch);
  requestGroupLocations(groupId);
  activeGroupId = groupId;
}

export function teardownGroupJourneySocket(groupId?: string) {
  if (activeGroupId && (!groupId || groupId === activeGroupId)) {
    leaveGroupRoom(activeGroupId);
    activeGroupId = null;
    teardownListeners();
  }
}
