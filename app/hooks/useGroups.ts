// app/hooks/useGroups.ts
// Custom hook for fetching groups data from backend

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { groupAPI } from '../services/api';

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
  members: Array<{
    id: string;
    role: string;
    joinedAt: string;
    user: {
      id: string;
      displayName: string;
      photoURL: string;
    };
  }>;
}

export const useGroups = () => {
  const { isAuthenticated } = useAuth();
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserGroups = async (status: 'active' | 'all' = 'active') => {
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
  };

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
        // Refresh groups list
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

  const joinGroup = async (code: string) => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await groupAPI.joinGroup(code);
      if (response?.group) {
        // Refresh groups list
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

  const leaveGroup = async (groupId: string) => {
    if (!isAuthenticated) return false;

    try {
      setError(null);
      const response = await groupAPI.leaveGroup(groupId);
      if (response?.success) {
        // Refresh groups list
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
  }, [isAuthenticated]);

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
