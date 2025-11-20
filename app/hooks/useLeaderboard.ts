// app/hooks/useLeaderboard.ts
// Custom hook for fetching leaderboard data from backend

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { leaderboardAPI } from '../services/api';

interface LeaderboardUser {
  id: string;
  displayName: string;
  photoURL: string;
  totalDistance: number;
  totalTime: number;
  topSpeed: number;
  totalTrips: number;
  rank: number;
  country?: string;
  flag?: string;
}

interface LeaderboardData {
  users: LeaderboardUser[];
  currentUser: LeaderboardUser | null;
  totalUsers: number;
  userPosition: number;
}

export const useLeaderboard = () => {
  const { isAuthenticated } = useAuth();
  const [friendsData, setFriendsData] = useState<LeaderboardData | null>(null);
  const [globalData, setGlobalData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFriendsLeaderboard = useCallback(async (sortBy: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime' = 'totalDistance') => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const response = await leaderboardAPI.getFriendsLeaderboard({ sortBy });
      if (response?.leaderboard) {
        setFriendsData({
          users: response.leaderboard,
          currentUser: response.leaderboard.find((u: any) => u.isCurrentUser) || null,
          totalUsers: response.leaderboard.length,
          userPosition: response.leaderboard.findIndex((u: any) => u.isCurrentUser) + 1,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch friends leaderboard');
      console.error('Friends leaderboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchGlobalLeaderboard = async (
    sortBy: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime' = 'totalDistance',
    page: number = 1,
    limit: number = 20
  ) => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const response = await leaderboardAPI.getGlobalLeaderboard({ sortBy, page, limit });
      if (response?.leaderboard) {
        setGlobalData({
          users: response.leaderboard,
          currentUser: null,
          totalUsers: response.pagination?.total || response.leaderboard.length,
          userPosition: 0,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch global leaderboard');
      console.error('Global leaderboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPosition = async (sortBy: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime' = 'totalDistance') => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await leaderboardAPI.getUserPosition({ sortBy });
      return response?.position || null;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch user position');
      console.error('User position fetch error:', err);
      return null;
    }
  };

  const refreshLeaderboard = async (type: 'friends' | 'global' = 'friends', sortBy: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime' = 'totalDistance') => {
    if (type === 'friends') {
      await fetchFriendsLeaderboard(sortBy);
    } else {
      await fetchGlobalLeaderboard(sortBy);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchFriendsLeaderboard();
    } else {
      setFriendsData(null);
      setGlobalData(null);
      setError(null);
    }
  }, [isAuthenticated, fetchFriendsLeaderboard]);

  return {
    friendsData,
    globalData,
    loading,
    error,
    refreshLeaderboard,
    fetchUserPosition,
  };
};
