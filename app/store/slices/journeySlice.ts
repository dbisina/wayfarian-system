// app/store/slices/journeySlice.ts
// Journey + group journey global store (Redux Toolkit)

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed?: number;
  heading?: number;
}

export interface JourneyInstance {
  id: string;
  userId: string;
  groupJourneyId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  startLatitude: number;
  startLongitude: number;
  currentLatitude?: number;
  currentLongitude?: number;
  totalDistance?: number;
  totalTime?: number;
  avgSpeed?: number;
  topSpeed?: number;
  startTime?: Date;
  endTime?: Date;
  user?: {
    id: string;
    displayName?: string;
    photoURL?: string;
  };
  displayName?: string;
  photoURL?: string;
  lastUpdate?: string;
}

export interface GroupJourney {
  id: string;
  groupId: string;
  creatorId: string;
  title: string;
  description?: string;
  endLatitude: number;
  endLongitude: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: Date;
  instances?: JourneyInstance[];
}

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
  groupJourneyId?: string;
  vehicle?: string;
  status: 'not-started' | 'active' | 'paused' | 'completed';
  photos: string[];
}

export interface GroupMemberLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed?: number;
  heading?: number;
}

export interface GroupMember {
  id: string;
  displayName: string;
  photoURL?: string;
  isOnline: boolean;
  currentLocation?: GroupMemberLocation;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
}

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export interface UploadJob {
  id: string;
  journeyId: string;
  uri: string;
  status: UploadStatus;
  remoteUrl?: string;
  error?: string;
  progress?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RideEvent {
  id: string;
  type: 'MEMBER_STARTED' | 'MEMBER_COMPLETED' | 'LOCATION_UPDATE' | 'MILESTONE' | 'MESSAGE' | 'CUSTOM';
  userId: string;
  username?: string;
  timestamp: Date;
  data?: any;
}

interface JourneyState {
  groupJourney: GroupJourney | null;
  currentJourney: JourneyData | null;
  myInstance: JourneyInstance | null;
  memberInstances: Record<string, JourneyInstance>;
  memberLocations: Record<string, LocationUpdate>;
  groupMembers: Record<string, GroupMember>;
  events: RideEvent[];
  status: 'idle' | 'loading' | 'active' | 'error';
  error: string | null;
  stats: {
    activeMembersCount: number;
    completedMembersCount: number;
    totalDistance: number;
    totalTime: number;
    movingTime: number;
    avgSpeed: number;
    topSpeed: number;
    currentSpeed: number;
  };
  hydrated: boolean;
  isTracking: boolean;
  isMinimized: boolean;
  routePoints: RoutePoint[];
  uploadQueue: UploadJob[];
  groupTracking: {
    isTracking: boolean;
    instanceId: string | null;
  };
}

const initialState: JourneyState = {
  groupJourney: null,
  currentJourney: null,
  myInstance: null,
  memberInstances: {},
  memberLocations: {},
  groupMembers: {},
  events: [],
  status: 'idle',
  error: null,
  stats: {
    activeMembersCount: 0,
    completedMembersCount: 0,
    totalDistance: 0,
    totalTime: 0,
    movingTime: 0,
    avgSpeed: 0,
    topSpeed: 0,
    currentSpeed: 0,
  },
  hydrated: false,
  isTracking: false,
  isMinimized: false,
  routePoints: [],
  uploadQueue: [],
  groupTracking: {
    isTracking: false,
    instanceId: null,
  },
};

const journeySlice = createSlice({
  name: 'journey',
  initialState,
  reducers: {
    setGroupJourney: (state, action: PayloadAction<GroupJourney | null>) => {
      state.groupJourney = action.payload;
      state.status = action.payload ? 'active' : 'idle';
      state.error = null;
      if (action.payload?.instances?.length) {
        action.payload.instances.forEach(instance => {
          state.memberInstances[instance.userId] = instance;
        });
      }
    },
    setCurrentJourney: (state, action: PayloadAction<JourneyData | null>) => {
      state.currentJourney = action.payload;
    },
    setMyInstance: (state, action: PayloadAction<JourneyInstance | null>) => {
      state.myInstance = action.payload;
      if (action.payload) {
        state.memberInstances[action.payload.userId] = action.payload;
      }
    },
    updateInstance: (state, action: PayloadAction<JourneyInstance>) => {
      const instance = action.payload;
      state.memberInstances[instance.userId] = instance;
      if (state.myInstance?.id === instance.id) {
        state.myInstance = instance;
      }
    },
    hydrateMembersFromSnapshot: (state, action: PayloadAction<any[]>) => {
      state.memberInstances = {};
      state.memberLocations = {};
      action.payload.forEach(member => {
        if (!member?.userId) return;
        state.memberInstances[member.userId] = {
          id: member.instanceId || member.id || member.userId,
          userId: member.userId,
          groupJourneyId: member.groupJourneyId || state.groupJourney?.id || '',
          status: (member.status || 'ACTIVE') as JourneyInstance['status'],
          startLatitude: member.startLatitude || member.latitude || 0,
          startLongitude: member.startLongitude || member.longitude || 0,
          currentLatitude: member.latitude,
          currentLongitude: member.longitude,
          totalDistance: member.totalDistance,
          totalTime: member.totalTime,
          avgSpeed: member.avgSpeed,
          topSpeed: member.topSpeed,
          startTime: member.startTime ? new Date(member.startTime) : undefined,
          endTime: member.endTime ? new Date(member.endTime) : undefined,
          displayName: member.displayName,
          photoURL: member.photoURL,
          lastUpdate: member.lastUpdate,
          user: member.user || {
            id: member.userId,
            displayName: member.displayName,
            photoURL: member.photoURL,
          },
        };

        if (member.latitude !== undefined && member.longitude !== undefined) {
          state.memberLocations[member.userId] = {
            latitude: member.latitude,
            longitude: member.longitude,
            timestamp: member.lastUpdate ? new Date(member.lastUpdate) : new Date(),
            speed: member.speed,
            heading: member.heading,
          };
        }

        state.groupMembers[member.userId] = {
          id: member.userId,
          displayName: member.displayName || member.user?.displayName || 'Member',
          photoURL: member.photoURL || member.user?.photoURL,
          isOnline: !!member.isOnline,
          currentLocation: member.latitude !== undefined && member.longitude !== undefined
            ? {
                latitude: member.latitude,
                longitude: member.longitude,
                timestamp: new Date(member.lastUpdate || Date.now()).getTime(),
                speed: member.speed,
                heading: member.heading,
              }
            : undefined,
        };
      });
    },
    mergeMemberLocation: (
      state,
      action: PayloadAction<{
        userId: string;
        instanceId?: string;
        latitude?: number;
        longitude?: number;
        totalDistance?: number;
        totalTime?: number;
        speed?: number;
        heading?: number;
        status?: JourneyInstance['status'];
        displayName?: string;
        photoURL?: string;
        lastUpdate?: string;
      }>
    ) => {
      const {
        userId,
        instanceId,
        latitude,
        longitude,
        totalDistance,
        totalTime,
        speed,
        heading,
        status,
        displayName,
        photoURL,
        lastUpdate,
      } = action.payload;
      if (!userId) return;

      const existing = state.memberInstances[userId] || {
        id: instanceId || userId,
        userId,
        groupJourneyId: state.groupJourney?.id || '',
        status: status || 'ACTIVE',
        startLatitude: latitude || 0,
        startLongitude: longitude || 0,
      };

      state.memberInstances[userId] = {
        ...existing,
        id: instanceId || existing.id,
        currentLatitude: latitude ?? existing.currentLatitude,
        currentLongitude: longitude ?? existing.currentLongitude,
        totalDistance: totalDistance ?? existing.totalDistance,
        totalTime: totalTime ?? existing.totalTime,
        status: status || existing.status,
        displayName: displayName || existing.displayName,
        photoURL: photoURL || existing.photoURL,
        lastUpdate: lastUpdate || existing.lastUpdate,
      };

      if (latitude !== undefined && longitude !== undefined) {
        state.memberLocations[userId] = {
          latitude,
          longitude,
          timestamp: lastUpdate ? new Date(lastUpdate) : new Date(),
          speed,
          heading,
        };

        state.groupMembers[userId] = {
          id: userId,
          displayName: displayName || state.groupMembers[userId]?.displayName || 'Member',
          photoURL: photoURL || state.groupMembers[userId]?.photoURL,
          isOnline: true,
          currentLocation: {
            latitude,
            longitude,
            timestamp: new Date(lastUpdate || Date.now()).getTime(),
            speed,
            heading,
          },
        };
      }
    },
    memberStarted: (state, action: PayloadAction<JourneyInstance>) => {
      const instance = action.payload;
      state.memberInstances[instance.userId] = instance;
      state.stats.activeMembersCount += 1;
      state.events.unshift({
        id: `${Date.now()}-${instance.userId}`,
        type: 'MEMBER_STARTED',
        userId: instance.userId,
        username: instance.displayName || instance.user?.displayName,
        timestamp: new Date(),
        data: { instance },
      });
    },
    updateMemberLocation: (state, action: PayloadAction<{ userId: string; location: LocationUpdate }>) => {
      const { userId, location } = action.payload;
      state.memberLocations[userId] = location;
      if (state.memberInstances[userId]) {
        state.memberInstances[userId].currentLatitude = location.latitude;
        state.memberInstances[userId].currentLongitude = location.longitude;
      }
      state.groupMembers[userId] = {
        id: userId,
        displayName: state.groupMembers[userId]?.displayName || 'Member',
        photoURL: state.groupMembers[userId]?.photoURL,
        isOnline: true,
        currentLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date(location.timestamp).getTime(),
          speed: location.speed,
          heading: location.heading,
        },
      };
    },
    memberCompleted: (state, action: PayloadAction<{ userId: string; instance: JourneyInstance }>) => {
      const { userId, instance } = action.payload;
      state.memberInstances[userId] = instance;
      state.stats.activeMembersCount = Math.max(0, state.stats.activeMembersCount - 1);
      state.stats.completedMembersCount += 1;
      state.events.unshift({
        id: `${Date.now()}-${userId}`,
        type: 'MEMBER_COMPLETED',
        userId,
        username: instance.displayName || instance.user?.displayName,
        timestamp: new Date(),
        data: {
          distance: instance.totalDistance,
          duration: instance.totalTime,
        },
      });
    },
    setGroupMembers: (state, action: PayloadAction<GroupMember[]>) => {
      state.groupMembers = action.payload.reduce<Record<string, GroupMember>>((acc, member) => {
        acc[member.id] = member;
        return acc;
      }, {});
    },
    upsertGroupMember: (state, action: PayloadAction<GroupMember>) => {
      const prev = state.groupMembers[action.payload.id];
      state.groupMembers[action.payload.id] = {
        ...prev,
        ...action.payload,
        currentLocation: action.payload.currentLocation || prev?.currentLocation,
      };
    },
    setMemberOnlineStatus: (state, action: PayloadAction<{ userId: string; isOnline: boolean }>) => {
      const prev = state.groupMembers[action.payload.userId];
      if (prev) {
          prev.isOnline = action.payload.isOnline;
      } else {
        state.groupMembers[action.payload.userId] = {
          id: action.payload.userId,
          displayName: 'Member',
          isOnline: action.payload.isOnline,
        };
      }
    },
    addEvent: (state, action: PayloadAction<RideEvent>) => {
      state.events.unshift(action.payload);
      if (state.events.length > 100) {
        state.events = state.events.slice(0, 100);
      }
    },
    setStats: (
      state,
      action: PayloadAction<{
        totalDistance: number;
        totalTime?: number;
        movingTime?: number;
        avgSpeed?: number;
        topSpeed?: number;
        currentSpeed?: number;
        activeMembersCount?: number;
        completedMembersCount?: number;
      }>
    ) => {
      state.stats = {
        ...state.stats,
        ...action.payload,
        totalTime: action.payload.totalTime ?? state.stats.totalTime,
        movingTime: action.payload.movingTime ?? state.stats.movingTime,
        avgSpeed: action.payload.avgSpeed ?? state.stats.avgSpeed,
        topSpeed: action.payload.topSpeed ?? state.stats.topSpeed,
        currentSpeed: action.payload.currentSpeed ?? state.stats.currentSpeed,
        activeMembersCount: action.payload.activeMembersCount ?? state.stats.activeMembersCount,
        completedMembersCount: action.payload.completedMembersCount ?? state.stats.completedMembersCount,
      };
    },
    setTracking: (state, action: PayloadAction<boolean>) => {
      state.isTracking = action.payload;
    },
    setRoutePoints: (state, action: PayloadAction<RoutePoint[]>) => {
      state.routePoints = action.payload;
    },
    appendRoutePoint: (state, action: PayloadAction<RoutePoint>) => {
      state.routePoints.push(action.payload);
    },
    clearRoutePoints: (state) => {
      state.routePoints = [];
    },
    enqueueUpload: (state, action: PayloadAction<UploadJob>) => {
      state.uploadQueue = [...state.uploadQueue.filter(job => job.id !== action.payload.id), action.payload];
    },
    updateUploadStatus: (
      state,
      action: PayloadAction<{ id: string; status: UploadStatus; remoteUrl?: string; progress?: number }>
    ) => {
      state.uploadQueue = state.uploadQueue.map(job =>
        job.id === action.payload.id
          ? {
              ...job,
              status: action.payload.status,
              remoteUrl: action.payload.remoteUrl ?? job.remoteUrl,
              progress: action.payload.progress ?? job.progress,
              updatedAt: Date.now(),
            }
          : job
      );
    },
    failUpload: (state, action: PayloadAction<{ id: string; error: string }>) => {
      state.uploadQueue = state.uploadQueue.map(job =>
        job.id === action.payload.id
          ? {
              ...job,
              status: 'failed',
              error: action.payload.error,
              updatedAt: Date.now(),
            }
          : job
      );
    },
    clearUploadQueue: (state, action: PayloadAction<{ journeyId?: string } | undefined>) => {
      const journeyId = action.payload?.journeyId;
      if (journeyId) {
        state.uploadQueue = state.uploadQueue.filter(job => job.journeyId !== journeyId);
      } else {
        state.uploadQueue = [];
      }
    },
    removeUploadJob: (state, action: PayloadAction<string>) => {
      state.uploadQueue = state.uploadQueue.filter(job => job.id !== action.payload);
    },
    setGroupTracking: (state, action: PayloadAction<{ isTracking: boolean; instanceId?: string | null }>) => {
      state.groupTracking = {
        isTracking: action.payload.isTracking,
        instanceId: action.payload.instanceId ?? null,
      };
    },
    setJourneyMinimized: (state, action: PayloadAction<boolean>) => {
      state.isMinimized = action.payload;
    },
    setHydrated: (state, action: PayloadAction<boolean>) => {
      state.hydrated = action.payload;
    },
    setStatus: (state, action: PayloadAction<'idle' | 'loading' | 'active' | 'error'>) => {
      state.status = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.status = action.payload ? 'error' : state.status;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearJourney: (state) => {
      state.groupJourney = null;
      state.currentJourney = null;
      state.myInstance = null;
      state.memberInstances = {};
      state.memberLocations = {};
      state.groupMembers = {};
      state.events = [];
      state.status = 'idle';
      state.error = null;
      state.stats = {
        activeMembersCount: 0,
        completedMembersCount: 0,
        totalDistance: 0,
        totalTime: 0,
        movingTime: 0,
        avgSpeed: 0,
        topSpeed: 0,
        currentSpeed: 0,
      };
      state.isTracking = false;
      state.isMinimized = false;
      state.routePoints = [];
      state.uploadQueue = [];
      state.groupTracking = { isTracking: false, instanceId: null };
    },
  },
});

export const {
  setGroupJourney,
  setCurrentJourney,
  setMyInstance,
  updateInstance,
  hydrateMembersFromSnapshot,
  mergeMemberLocation,
  memberStarted,
  updateMemberLocation,
  memberCompleted,
  setGroupMembers,
  upsertGroupMember,
  setMemberOnlineStatus,
  addEvent,
  setStats,
  setTracking,
  setRoutePoints,
  appendRoutePoint,
  clearRoutePoints,
  enqueueUpload,
  updateUploadStatus,
  failUpload,
  clearUploadQueue,
  removeUploadJob,
  setGroupTracking,
  setJourneyMinimized,
  setHydrated,
  setStatus,
  setError,
  clearError,
  clearJourney,
} = journeySlice.actions;

export default journeySlice.reducer;
