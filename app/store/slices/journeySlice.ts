// app/store/slices/journeySlice.ts
// Journey state management with real-time updates

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface LocationUpdate {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed?: number;
  heading?: number;
}

interface JourneyInstance {
  id: string;
  userId: string;
  groupJourneyId: string;
  status: 'active' | 'paused' | 'completed';
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
    username: string;
    profilePicture?: string;
  };
}

interface GroupJourney {
  id: string;
  groupId: string;
  creatorId: string;
  title: string;
  description?: string;
  endLatitude: number;
  endLongitude: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  instances?: JourneyInstance[];
}

interface RideEvent {
  id: string;
  type: 'MEMBER_STARTED' | 'MEMBER_COMPLETED' | 'LOCATION_UPDATE' | 'MILESTONE';
  userId: string;
  username: string;
  timestamp: Date;
  data?: any;
}

interface JourneyState {
  // Current active journey
  groupJourney: GroupJourney | null;
  myInstance: JourneyInstance | null;
  
  // Member tracking
  memberInstances: Record<string, JourneyInstance>;
  memberLocations: Record<string, LocationUpdate>;
  
  // Events timeline
  events: RideEvent[];
  
  // UI state
  status: 'idle' | 'loading' | 'active' | 'error';
  error: string | null;
  
  // Stats
  stats: {
    activeMembersCount: number;
    completedMembersCount: number;
    totalDistance: number;
  };
}

const initialState: JourneyState = {
  groupJourney: null,
  myInstance: null,
  memberInstances: {},
  memberLocations: {},
  events: [],
  status: 'idle',
  error: null,
  stats: {
    activeMembersCount: 0,
    completedMembersCount: 0,
    totalDistance: 0,
  },
};

const journeySlice = createSlice({
  name: 'journey',
  initialState,
  reducers: {
    // Set group journey
    setGroupJourney: (state, action: PayloadAction<GroupJourney>) => {
      state.groupJourney = action.payload;
      state.status = 'active';
      state.error = null;
      
      // Initialize instances
      if (action.payload.instances) {
        action.payload.instances.forEach(instance => {
          state.memberInstances[instance.userId] = instance;
        });
      }
    },
    
    // Set my instance
    setMyInstance: (state, action: PayloadAction<JourneyInstance>) => {
      state.myInstance = action.payload;
      state.memberInstances[action.payload.userId] = action.payload;
    },
    
    // Update instance
    updateInstance: (state, action: PayloadAction<JourneyInstance>) => {
      const instance = action.payload;
      state.memberInstances[instance.userId] = instance;
      
      // Update my instance if it's mine
      if (state.myInstance && state.myInstance.id === instance.id) {
        state.myInstance = instance;
      }
    },
    
    // Member started
    memberStarted: (state, action: PayloadAction<JourneyInstance>) => {
      const instance = action.payload;
      state.memberInstances[instance.userId] = instance;
      state.stats.activeMembersCount += 1;
      
      // Add event
      state.events.unshift({
        id: `${Date.now()}-${instance.userId}`,
        type: 'MEMBER_STARTED',
        userId: instance.userId,
        username: instance.user?.username || 'Unknown',
        timestamp: new Date(),
        data: { instance },
      });
    },
    
    // Update member location
    updateMemberLocation: (state, action: PayloadAction<{ userId: string; location: LocationUpdate }>) => {
      const { userId, location } = action.payload;
      state.memberLocations[userId] = location;
      
      // Update instance if exists
      if (state.memberInstances[userId]) {
        state.memberInstances[userId].currentLatitude = location.latitude;
        state.memberInstances[userId].currentLongitude = location.longitude;
      }
    },
    
    // Member completed
    memberCompleted: (state, action: PayloadAction<{ userId: string; instance: JourneyInstance }>) => {
      const { userId, instance } = action.payload;
      state.memberInstances[userId] = instance;
      state.stats.activeMembersCount -= 1;
      state.stats.completedMembersCount += 1;
      
      // Add event
      state.events.unshift({
        id: `${Date.now()}-${userId}`,
        type: 'MEMBER_COMPLETED',
        userId,
        username: instance.user?.username || 'Unknown',
        timestamp: new Date(),
        data: { 
          distance: instance.totalDistance,
          duration: instance.totalTime,
        },
      });
    },
    
    // Add event
    addEvent: (state, action: PayloadAction<RideEvent>) => {
      state.events.unshift(action.payload);
      
      // Keep only last 100 events
      if (state.events.length > 100) {
        state.events = state.events.slice(0, 100);
      }
    },
    
    // Set status
    setStatus: (state, action: PayloadAction<'idle' | 'loading' | 'active' | 'error'>) => {
      state.status = action.payload;
    },
    
    // Set error
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.status = 'error';
    },
    
    // Clear error
    clearError: (state) => {
      state.error = null;
    },
    
    // Clear journey (when leaving)
    clearJourney: (state) => {
      state.groupJourney = null;
      state.myInstance = null;
      state.memberInstances = {};
      state.memberLocations = {};
      state.events = [];
      state.status = 'idle';
      state.error = null;
      state.stats = {
        activeMembersCount: 0,
        completedMembersCount: 0,
        totalDistance: 0,
      };
    },
  },
});

export const {
  setGroupJourney,
  setMyInstance,
  updateInstance,
  memberStarted,
  updateMemberLocation,
  memberCompleted,
  addEvent,
  setStatus,
  setError,
  clearError,
  clearJourney,
} = journeySlice.actions;

export default journeySlice.reducer;
