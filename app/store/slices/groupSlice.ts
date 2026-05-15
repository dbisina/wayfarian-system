import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** A single member within a group, including their nested user profile. */
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

/** A cycling group with optional member list and aggregate counts. */
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

/** Redux slice state for groups. */
interface GroupState {
  /** All discoverable groups (public listing). */
  groups: Group[];
  /** Currently viewed / active group. */
  selectedGroup: Group | null;
  /** Groups the authenticated user belongs to. */
  myGroups: Group[];
  loading: boolean;
  error: string | null;
  cache: {
    lastFetch: Date | null;
    /** How long the cached listing is considered fresh, in milliseconds. */
    ttl: number;
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
    /** Replace the public group listing and stamp the cache fetch time. */
    setGroups: (state, action: PayloadAction<Group[]>) => {
      state.groups = action.payload;
      state.cache.lastFetch = new Date();
      state.loading = false;
      state.error = null;
    },

    /** Replace the current user's group membership list. */
    setMyGroups: (state, action: PayloadAction<Group[]>) => {
      state.myGroups = action.payload;
      state.loading = false;
    },

    /** Set the group currently being viewed or interacted with. */
    selectGroup: (state, action: PayloadAction<Group>) => {
      state.selectedGroup = action.payload;
    },

    /** Prepend a newly created group to both listings so the UI reflects it immediately. */
    addGroup: (state, action: PayloadAction<Group>) => {
      state.groups.unshift(action.payload);
      state.myGroups.unshift(action.payload);
    },

    /** Patch an existing group in all three stores (listing, mine, selected) atomically. */
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

    /**
     * Remove a group from all stores by ID.
     * Clears `selectedGroup` if the deleted group was selected.
     */
    deleteGroup: (state, action: PayloadAction<string>) => {
      state.groups = state.groups.filter(g => g.id !== action.payload);
      state.myGroups = state.myGroups.filter(g => g.id !== action.payload);

      if (state.selectedGroup?.id === action.payload) {
        state.selectedGroup = null;
      }
    },

    /** Toggle the loading flag during async group operations. */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },

    /** Record a group operation error and clear the loading flag. */
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },

    /** Dismiss any previously recorded group error. */
    clearError: (state) => {
      state.error = null;
    },

    /** Invalidate the cache and clear the group listing, forcing a fresh fetch on next access. */
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
  clearCache,
} = groupSlice.actions;

/**
 * Returns true when the cached group listing has exceeded its TTL and should be re-fetched.
 * @param state - The group slice state (not the root state).
 */
export const isCacheStale = (state: GroupState) => {
  if (!state.cache.lastFetch) return true;
  const now = new Date().getTime();
  const lastFetch = new Date(state.cache.lastFetch).getTime();
  return (now - lastFetch) > state.cache.ttl;
};

export default groupSlice.reducer;
