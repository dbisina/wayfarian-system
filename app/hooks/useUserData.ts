// app/hooks/useUserData.ts
// Custom hook for fetching and managing user data from backend

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';


interface DashboardData {
  user: {
    displayName: string;
    photoURL: string;
    totalDistance: number;
    totalTime: number;
    topSpeed: number;
    totalTrips: number;
    xp?: number;
    level?: number;
  };
  activeJourney: any;
  recentJourneys: any[];
  activeGroups: any[];
  recentPhotos: any[];
  weeklyStats: {
    journeys: number;
    distance: number;
    time: number;
  };
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  badge?: string; // Badge filename from server
  tiers: {
    level: number;
    threshold: number;
    name?: string;
    unlocked: boolean;
  }[];
  current: number;
  icon: string;
  threshold?: number;
  type?: string;
  unlocked?: boolean;
}

export const useUserData = () => {
  const { user, isAuthenticated } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementsSummary, setAchievementsSummary] = useState<{ totalAchievements: number; totalTiers: number; unlockedTiers: number; progress: number | string; accountAge: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true); // Default to true so skeletons show on mount
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setStatsLoading(true);
      setError(null);

      // 1. Fetch critical data (User + Active Journey) - FAST
      const response = await userAPI.getDashboard();
      if (response?.dashboard) {
        setDashboardData(prev => ({
          ...prev, // Keep existing data (charts/etc) while refreshing user info
          ...response.dashboard,
          // If this is the first load, explicitely set missing fields to empty to prevent UI errors
          recentJourneys: prev?.recentJourneys || [],
          activeGroups: prev?.activeGroups || [],
          recentPhotos: prev?.recentPhotos || [],
          weeklyStats: prev?.weeklyStats || { journeys: 0, distance: 0, time: 0 }
        } as DashboardData));
      }

      // 2. Fetch heavy stats (Charts, History, etc) - SLOW (Background)
      // We don't await this so the UI unblocks immediately
      userAPI.getDashboardStats().then((statsResponse) => {
        if (statsResponse?.stats) {
          setDashboardData(prev => ({
            ...prev,
            ...statsResponse.stats,
            user: prev?.user || statsResponse.stats.user, // Ensure user object persists
          } as DashboardData));
        }
      }).catch(err => {
        console.warn('Background stats fetch failed:', err);
        // Don't set main error state as the app is usable
      }).finally(() => {
        setStatsLoading(false);
      });

    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data');
      console.error('Dashboard fetch error:', err);
      setStatsLoading(false); // Ensure we don't get stuck in loading state on error
    } finally {
      setLoading(false);
      // Note: Loading state turns off after CRITICAL data is loaded. 
      // Stats loading state stays on until background fetch finishes.
    }
  }, [isAuthenticated]);

  const fetchAchievements = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setError(null);
      const response = await userAPI.getAchievements();
      if (response?.achievements) {
        setAchievements(response.achievements);
        if (response?.summary) setAchievementsSummary(response.summary);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch achievements');
      console.error('Achievements fetch error:', err);
    }
  }, [isAuthenticated]);

  const fetchUserStats = async (period: 'allTime' | 'week' | 'month' | 'year' = 'allTime') => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await userAPI.getStats(period);
      return response?.stats || null;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch user stats');
      console.error('Stats fetch error:', err);
      return null;
    }
  };

  const fetchJourneyHistory = async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    vehicle?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    if (!isAuthenticated) return null;

    try {
      setError(null);
      const response = await userAPI.getJourneyHistory(params);
      return response?.journeys || [];
    } catch (err: any) {
      setError(err.message || 'Failed to fetch journey history');
      console.error('Journey history fetch error:', err);
      return [];
    }
  };

  const refreshData = useCallback(async () => {
    await Promise.all([
      fetchDashboardData(),
      fetchAchievements(),
    ]);
  }, [fetchDashboardData, fetchAchievements]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
    } else {
      setDashboardData(null);
      setAchievements([]);
      setError(null);
    }
  }, [isAuthenticated, user?.id, refreshData]);

  return {
    dashboardData,
    achievements,
    achievementsSummary,
    loading,
    statsLoading, // Export this
    error,
    refreshData,
    fetchUserStats,
    fetchJourneyHistory,
    fetchAchievements,
  };
};
