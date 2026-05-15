import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { groupAPI } from '../services/api';

/** Full group record as returned by the backend. */
interface Group {
  id: string;
  name: string;
  description: string;
  code: string;
  maxMembers: number;
  isPrivate: boolean;
  allowLocationSharing: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  _count: {
    members: number;
  };
  members: {
    id: string;
    role: string;
    joinedAt: string;
    user: {
      id: string;
      displayName: string;
      photoURL: string;
    };
  }[];
}

/**
 * Provides CRUD operations for the authenticated user's groups.
 *
 * All mutating operations (`createGroup`, `joinGroup`, `leaveGroup`) automatically
 * refresh the `userGroups` list on success so callers never need to trigger a
 * manual reload.
 *
 * @returns `{ userGroups, loading, error, fetchUserGroups, createGroup, joinGroup, leaveGroup, getGroupDetails, refreshGroups }`
 */
export const useGroups = () => {
  const { isAuthenticated } = useAuth();
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch the authenticated user's groups from the backend.
   * @param status - Filter by `'active'` (default) or `'all'`.
   */
  const fetchUserGroups = useCallback(async (status: 'active' | 'all' = 'active') => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const response = await groupAPI.getUserGroups(status);
      if (response?.groups) {
        setUserGroups(response.groups);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch user groups');
      console.error('User groups fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Create a new group and refresh the groups list.
   * @returns The created group, or null on failure.
   */
  const createGroup = async (groupData: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPrivate?: boolean;
    allowLocationSharing?: boolean;
  }) => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await groupAPI.createGroup(groupData);
      if (response?.group) {
        await fetchUserGroups();
        return response.group;
      }
      return null;
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
      console.error('Create group error:', err);
      return null;
    }
  };

  /**
   * Join a group by its invite code and refresh the groups list.
   * @param code - The group's invite code.
   * @returns The joined group, or null on failure.
   */
  const joinGroup = async (code: string) => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await groupAPI.joinGroup(code);
      if (response?.group) {
        await fetchUserGroups();
        return response.group;
      }
      return null;
    } catch (err: any) {
      setError(err.message || 'Failed to join group');
      console.error('Join group error:', err);
      return null;
    }
  };

  /**
   * Leave a group and refresh the groups list.
   * @param groupId - The ID of the group to leave.
   * @returns True on success, false on failure.
   */
  const leaveGroup = async (groupId: string) => {
    if (!isAuthenticated) return false;

    try {
      setError(null);
      const response = await groupAPI.leaveGroup(groupId);
      if (response?.success) {
        await fetchUserGroups();
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err.message || 'Failed to leave group');
      console.error('Leave group error:', err);
      return false;
    }
  };

  /**
   * Fetch a single group's full details.
   * @param groupId - The group's ID.
   * @returns The group record, or null on failure.
   */
  const getGroupDetails = async (groupId: string) => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await groupAPI.getGroup(groupId);
      return response?.group || null;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch group details');
      console.error('Get group details error:', err);
      return null;
    }
  };

  /** Alias for `fetchUserGroups()` exposed for explicit pull-to-refresh gestures. */
  const refreshGroups = async () => {
    await fetchUserGroups();
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUserGroups();
    } else {
      setUserGroups([]);
      setError(null);
    }
  }, [isAuthenticated, fetchUserGroups]);

  return {
    userGroups,
    loading,
    error,
    fetchUserGroups,
    createGroup,
    joinGroup,
    leaveGroup,
    getGroupDetails,
    refreshGroups,
  };
};
