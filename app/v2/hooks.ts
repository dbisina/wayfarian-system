// app/v2/hooks.ts
// React hooks over the v2 runtime. Every query key starts with the signed-in user's id, so
// cached data can never be shown to a different account.

import { useEffect, useState } from 'react';
import type { ProbeState } from './serverProbe';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getRuntime } from './runtime';
import type { LiveStats } from './recorder';
import type { SyncState } from './outbox';

export const qk = {
  summary: (uid: string) => ['u', uid, 'summary'] as const,
  rides: (uid: string) => ['u', uid, 'rides'] as const,
  ride: (uid: string, id: string) => ['u', uid, 'ride', id] as const,
  leaderboard: (uid: string, metric: string, period: string) => ['u', uid, 'leaderboard', metric, period] as const,
  leaderboardMe: (uid: string, metric: string, period: string) => ['u', uid, 'leaderboard-me', metric, period] as const,
  groupRides: (uid: string) => ['u', uid, 'group-rides'] as const,
  groupRide: (uid: string, id: string) => ['u', uid, 'group-ride', id] as const,
  groupSummary: (uid: string, id: string) => ['u', uid, 'group-summary', id] as const,
  rider: (uid: string, id: string) => ['u', uid, 'rider', id] as const,
  vehicle: (uid: string, id: string) => ['u', uid, 'vehicle', id] as const,
};

function useUid(): string | null {
  const { user } = useAuth();
  return user?.id ?? null;
}

export function useV2Summary() {
  const uid = useUid();
  return useQuery({ queryKey: qk.summary(uid ?? 'none'), queryFn: () => getRuntime().client.summary(), enabled: !!uid });
}

export function useV2Rides() {
  const uid = useUid();
  return useInfiniteQuery({
    queryKey: qk.rides(uid ?? 'none'),
    queryFn: ({ pageParam }) => getRuntime().client.listRides(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!uid,
  });
}

export function useV2Ride(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: qk.ride(uid ?? 'none', id ?? ''), queryFn: () => getRuntime().client.getRide(id!), enabled: !!uid && !!id });
}

export function useV2Leaderboard(metric = 'distance', period = 'week') {
  const uid = useUid();
  return useQuery({
    queryKey: qk.leaderboard(uid ?? 'none', metric, period),
    queryFn: () => getRuntime().client.leaderboard({ metric, period }),
    enabled: !!uid,
    staleTime: 60_000,
  });
}

export function useV2LeaderboardMe(metric = 'distance', period = 'week') {
  const uid = useUid();
  return useQuery({
    queryKey: qk.leaderboardMe(uid ?? 'none', metric, period),
    queryFn: () => getRuntime().client.leaderboardMe({ metric, period }),
    enabled: !!uid,
    staleTime: 60_000,
  });
}

export function useV2GroupRides() {
  const uid = useUid();
  return useQuery({ queryKey: qk.groupRides(uid ?? 'none'), queryFn: () => getRuntime().client.groupRides(), enabled: !!uid });
}

export function useV2GroupRide(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: qk.groupRide(uid ?? 'none', id ?? ''), queryFn: () => getRuntime().client.groupRide(id!), enabled: !!uid && !!id });
}

export function useV2GroupSummary(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: qk.groupSummary(uid ?? 'none', id ?? ''), queryFn: () => getRuntime().client.groupRideSummary(id!), enabled: !!uid && !!id });
}

export function useV2Rider(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: qk.rider(uid ?? 'none', id ?? ''), queryFn: () => getRuntime().client.rider(id!), enabled: !!uid && !!id });
}

export function useV2Vehicle(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: qk.vehicle(uid ?? 'none', id ?? ''), queryFn: () => getRuntime().client.vehicle(id!), enabled: !!uid && !!id });
}

/** Live stats of the ride being recorded on this phone (null when none). Updates on every GPS fix. */
export function useLiveRide(): LiveStats | null {
  const [live, setLive] = useState<LiveStats | null>(() => getRuntime().recorder.live());
  useEffect(() => {
    const rt = getRuntime();
    rt.liveListeners.add(setLive);
    setLive(rt.recorder.live());
    return () => { rt.liveListeners.delete(setLive); };
  }, []);
  return live;
}

/** Upload queue state, for "N rides waiting to upload" style UI. */
export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>({ pending: 0, dead: 0, authRequired: false });
  useEffect(() => {
    const rt = getRuntime();
    rt.syncListeners.add(setState);
    rt.engine.state().then(setState).catch(() => {});
    return () => { rt.syncListeners.delete(setState); };
  }, []);
  return state;
}

/** Whether the server has the v2 API: unknown until the first check, then available or missing. */
export function useServerV2(): ProbeState {
  const [state, setState] = useState<ProbeState>(() => getRuntime().probe.state);
  useEffect(() => {
    const probe = getRuntime().probe;
    setState(probe.state);
    return probe.subscribe(setState);
  }, []);
  return state;
}
