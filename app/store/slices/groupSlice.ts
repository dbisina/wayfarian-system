// app/store/slices/groupSlice.ts
// Group state management

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface GroupMember {
  id: string;
  userId: string;
  role: 'admin' | 'member';
  user: {
    id: string;
    username: string;
    profilePicture?: string;
  };
}

interface Group {
  id: string;
  name: string;
  description?: string;
  coverPhotoURL?: string;
  creatorId: string;
  createdAt: Date;
  members?: GroupMember[];
  _count?: {
    members: number;
    journeys: number;
  };
}

interface GroupState {
  groups: Group[];
  selectedGroup: Group | null;
  myGroups: Group[];
  loading: boolean;
  error: string | null;
  cache: {
    lastFetch: Date | null;
    ttl: number; // milliseconds
  };
}

const initialState: GroupState = {
  groups: [],
  selectedGroup: null,
  myGroups: [],
  loading: false,
  error: null,
  cache: {
    lastFetch: null,
    ttl: 5 * 60 * 1000, // 5 minutes
  },
};

const groupSlice = createSlice({
  name: 'group',
  initialState,
  reducers: {
    // Set all groups
    setGroups: (state, action: PayloadAction<Group[]>) => {
      state.groups = action.payload;
      state.cache.lastFetch = new Date();
      state.loading = false;
      state.error = null;
    },
    
    // Set my groups
    setMyGroups: (state, action: PayloadAction<Group[]>) => {
      state.myGroups = action.payload;
      state.loading = false;
    },
    
    // Select group
    selectGroup: (state, action: PayloadAction<Group>) => {
      state.selectedGroup = action.payload;
    },
    
    // Add group
    addGroup: (state, action: PayloadAction<Group>) => {
      state.groups.unshift(action.payload);
      state.myGroups.unshift(action.payload);
    },
    
    // Update group
    updateGroup: (state, action: PayloadAction<Group>) => {
      const index = state.groups.findIndex(g => g.id === action.payload.id);
      if (index !== -1) {
        state.groups[index] = action.payload;
      }
      
      const myIndex = state.myGroups.findIndex(g => g.id === action.payload.id);
      if (myIndex !== -1) {
        state.myGroups[myIndex] = action.payload;
      }
      
      if (state.selectedGroup?.id === action.payload.id) {
        state.selectedGroup = action.payload;
      }
    },
    
    // Delete group
    deleteGroup: (state, action: PayloadAction<string>) => {
      state.groups = state.groups.filter(g => g.id !== action.payload);
      state.myGroups = state.myGroups.filter(g => g.id !== action.payload);
      
      if (state.selectedGroup?.id === action.payload) {
        state.selectedGroup = null;
      }
    },
    
    // Set loading
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    // Set error
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },
    
    // Clear error
    clearError: (state) => {
      state.error = null;
    },
    
    // Check if cache is stale
    isCacheStale: (state) => {
      if (!state.cache.lastFetch) return true;
      const now = new Date().getTime();
      const lastFetch = new Date(state.cache.lastFetch).getTime();
      return (now - lastFetch) > state.cache.ttl;
    },
    
    // Clear cache
    clearCache: (state) => {
      state.cache.lastFetch = null;
      state.groups = [];
    },
  },
});

export const {
  setGroups,
  setMyGroups,
  selectGroup,
  addGroup,
  updateGroup,
  deleteGroup,
  setLoading,
  setError,
  clearError,
  isCacheStale,
  clearCache,
} = groupSlice.actions;

export default groupSlice.reducer;
