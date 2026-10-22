// app/v2/legacyAdapters.ts
//
// Home, Profile, Badges and Leaderboard were laid out against the v1 hooks' response shapes.
// These hooks return the same shapes from v2 data, so those screens keep their layout and only
// change where the numbers come from. Units are converted here, once: v1 screens expect km and
// km/h, v2 stores metres and m/s.

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getRuntime } from './runtime';
import { asLegacyAchievements, buildFamilies } from './badges';
import { useV2Rides, useV2Summary } from './hooks';

/** Drop-in for useUserData(): { dashboardData, achievements, loading, refreshData }. */
export function useV2UserData() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const summary = useV2Summary();
  const rides = useV2Rides();

  const dashboardData = useMemo(() => {
    const s = summary.data;
    if (!s) return null;
    const recent = (rides.data?.pages[0]?.items ?? [])
      .filter((r: any) => r.status === 'FINALIZED' && r.distanceM >= 100)
      .slice(0, 5)
      .map((r: any) => ({
        id: r.id,
        title: r.title ?? undefined,
        customTitle: r.title ?? null,
        startTime: r.startedAt,
        endTime: r.endedAt ?? undefined,
        totalDistance: r.distanceM / 1000,
        totalTime: r.movingTimeS,
        topSpeed: r.topSpeedMps * 3.6,
        avgSpeed: r.avgSpeedMps * 3.6,
      }));
    return {
      user: {
        displayName: user?.displayName,
        photoURL: user?.photoURL,
        email: user?.email,
        country: user?.country,
        countryCode: user?.countryCode,
        totalDistance: s.distanceM / 1000,
        totalTime: s.movingTimeS,
        topSpeed: s.topSpeedMps * 3.6,
        totalTrips: s.rides,
        xp: s.xp,
        level: s.level,
      },
      recentJourneys: recent,
      streak: s.streak,
    };
  }, [summary.data, rides.data, user?.displayName]);

  const achievements = useMemo(() => asLegacyAchievements(buildFamilies(summary.data?.badgeProgress ?? [])), [summary.data]);

  const refreshData = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['u', user?.id ?? 'none'] });
  }, [qc, user?.id]);

  return { dashboardData, achievements, loading: summary.isLoading, refreshData };
}

type Tab = 'friends' | 'global';

/**
 * Drop-in for useLeaderboard(): { friendsData, globalData, loading, error, refreshLeaderboard }.
 * "Friends" are the riders you have shared a group ride with.
 */
export function useV2LeaderboardView(period: string = 'allTime') {
  const { user } = useAuth();
  const uid = user?.id ?? 'none';
  const qc = useQueryClient();
  const load = (scope: Tab) => async () => {
    const [board, me] = await Promise.all([
      getRuntime().client.leaderboard({ metric: 'distance', period, limit: 50, scope: scope === 'friends' ? 'friends' : undefined }),
      getRuntime().client.leaderboardMe({ metric: 'distance', period }),
    ]);
    const users = board.items.map((i: any) => ({
      id: i.userId,
      userId: i.userId,
      rank: i.rank,
      position: i.rank,
      displayName: i.displayName,
      photoURL: i.photoURL,
      countryCode: i.countryCode,
      level: i.level,
      totalDistance: i.value / 1000,
    }));
    const mine = users.find((u: any) => u.userId === user?.id);
    const currentUser = {
      id: user?.id,
      displayName: user?.displayName,
      rank: scope === 'friends' ? mine?.rank ?? null : me.rank,
      position: scope === 'friends' ? mine?.rank ?? null : me.rank,
      totalDistance: (me.value || 0) / 1000,
    };
    return { users, currentUser };
  };

  const global = useQuery({ queryKey: ['u', uid, 'lb-view', 'global', period], queryFn: load('global'), enabled: !!user?.id, staleTime: 60_000 });
  const friends = useQuery({ queryKey: ['u', uid, 'lb-view', 'friends', period], queryFn: load('friends'), enabled: !!user?.id, staleTime: 60_000 });

  const refreshLeaderboard = useCallback(
    async (tab: Tab = 'global', _sortBy?: string) => {
      await qc.invalidateQueries({ queryKey: ['u', uid, 'lb-view', tab, period] });
    },
    [qc, uid, period]
  );

  return {
    friendsData: friends.data ?? null,
    globalData: global.data ?? null,
    loading: global.isFetching || friends.isFetching,
    error: (global.error as Error | null)?.message ?? null,
    refreshLeaderboard,
  };
}
