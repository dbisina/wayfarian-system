// app/hooks/useUserData.ts
// Custom hook for fetching and managing user data from backend

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

interface UserStats {
  totalDistance: number;
  totalTime: number;
  topSpeed: number;
  totalTrips: number;
  averageSpeed: number;
}

interface DashboardData {
  user: {
    displayName: string;
    photoURL: string;
    totalDistance: number;
    totalTime: number;
    topSpeed: number;
    totalTrips: number;
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
  tiers: Array<{
    level: number;
    threshold: number;
    name?: string;
    unlocked: boolean;
  }>;
  current: number;
  icon: string;
}

export const useUserData = () => {
  const { user, isAuthenticated } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const response = await userAPI.getDashboard();
      if (response?.dashboard) {
        setDashboardData(response.dashboard);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data');
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAchievements = async () => {
    if (!isAuthenticated) return;

    try {
      setError(null);
      const response = await userAPI.getAchievements();
      if (response?.achievements) {
        setAchievements(response.achievements);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch achievements');
      console.error('Achievements fetch error:', err);
    }
  };

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

  const refreshData = async () => {
    await Promise.all([
      fetchDashboardData(),
      fetchAchievements(),
    ]);
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
    } else {
      setDashboardData(null);
      setAchievements([]);
      setError(null);
    }
  }, [isAuthenticated, user?.id]);

  return {
    dashboardData,
    achievements,
    loading,
    error,
    refreshData,
    fetchUserStats,
    fetchJourneyHistory,
    fetchAchievements,
  };
};
