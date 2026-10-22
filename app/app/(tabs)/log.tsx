import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useQuery } from '@tanstack/react-query';
import { useServerV2, useV2LeaderboardMe, useV2Rides } from '../../v2/hooks';
import { leaderboardAPI, userAPI } from '../../services/api';
import { useTranslation } from 'react-i18next';
import JourneyCardMenu from '../../components/ui/JourneyCardMenu';
import Cut from '../../components/dw/Cut';
import Icon from '../../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../../constants/design';

type JourneyItem = {
  id: string;
  title?: string;
  customTitle?: string | null;
  startTime?: string;
  endTime?: string;
  totalDistance?: number;
  totalTime?: number;
  group?: { id: string; name: string } | null;
  groupJourneyId?: string | null;
  coverPhotoUrl?: string;
  photos?: {
    id: string;
    firebasePath?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
  }[];
};

export default function RideLogScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const d = useDW();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();
  const { convertDistance } = useSettings();
  
  const ridesQuery = useV2Rides();
  const meQuery = useV2LeaderboardMe('distance', 'allTime');
  const [activeTab, setActiveTab] = useState('solo');

  // Until the server has the v2 API, show the history the older API still holds.
  const serverV2 = useServerV2();
  const legacyMode = serverV2 === 'missing';
  const legacy = useQuery({
    queryKey: ['v1-log'],
    enabled: legacyMode && isAuthenticated,
    queryFn: async () => {
      const [pos, hist] = await Promise.all([
        leaderboardAPI.getUserPosition().catch(() => null),
        userAPI.getJourneyHistory({ limit: 40, sortBy: 'startTime', sortOrder: 'desc' }),
      ]);
      return { pos, hist };
    },
  });

  // Rides come from the v2 cache: shown instantly from the last fetch (even offline), refreshed
  // whenever the screen is focused and the data is older than 30 seconds.
  const journeys: JourneyItem[] = useMemo(
    () =>
      legacyMode
        ? ((legacy.data?.hist as any)?.journeys ?? [])
        : (ridesQuery.data?.pages.flatMap((p) => p.items) ?? [])
        .filter((r: any) => r.status === 'FINALIZED' && r.distanceM >= 100)
        .map((r: any) => ({
          id: r.id,
          title: r.title ?? undefined,
          customTitle: r.title ?? null,
          startTime: r.startedAt,
          endTime: r.endedAt ?? undefined,
          totalDistance: r.distanceM / 1000,
          totalTime: r.movingTimeS,
          group: r.groupRideId ? { id: r.groupRideId, name: t('log.groupRide', { defaultValue: 'Group ride' }) } : null,
          groupJourneyId: null,
        })),
    [ridesQuery.data, legacy.data, legacyMode, t]
  );
  const soloJourneys = useMemo(() => journeys.filter((j) => !j.group), [journeys]);
  const groupJourneys = useMemo(() => journeys.filter((j) => !!j.group), [journeys]);
  const rank: number | null = legacyMode
    ? ((legacy.data?.pos as any)?.user?.position ?? (legacy.data?.pos as any)?.position ?? null)
    : (meQuery.data?.rank ?? null);
  const nextBadge: string = t('log.nextMilestone');
  const loading = legacyMode ? legacy.isLoading : ridesQuery.isLoading;
  const loadData = useCallback(() => { void (legacyMode ? legacy.refetch() : ridesQuery.refetch()); }, [ridesQuery, legacy, legacyMode]);

  useFocusEffect(
    useCallback(() => {
      if (legacyMode) { void legacy.refetch(); return; }
      void ridesQuery.refetch();
      void meQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const normalizeDistance = (value?: number) => {
    if (!value || value <= 0) return 0;
    return value;
  };

  const formatDistance = (km?: number) => {
    return convertDistance(normalizeDistance(km));
  };
  
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const formatDateLabel = (iso?: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    return date.toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
    });
  };

  const getTimeLabel = (iso?: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    return date.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const groupedSoloByDate = useMemo(() => {
    const groups: { month: string; journeys: JourneyItem[] }[] = [];
    soloJourneys.forEach(j => {
      const date = new Date(j.startTime || '');
      const month = date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
      const group = groups.find(g => g.month === month);
      if (group) {
        group.journeys.push(j);
      } else {
        groups.push({ month, journeys: [j] });
      }
    });
    return groups;
  }, [soloJourneys, i18n.language]);

  const groupedGroupJourneys = useMemo(() => {
    const groups: { month: string; items: { name: string; journeys: JourneyItem[] }[] }[] = [];
    groupJourneys.forEach(j => {
      const date = new Date(j.startTime || '');
      const month = date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
      const monthGroup = groups.find(g => g.month === month);
      
      const groupName = j.group?.name || t('log.groupRideDefault');
      
      if (monthGroup) {
        const item = monthGroup.items.find(i => i.name === groupName);
        if (item) {
          item.journeys.push(j);
        } else {
          monthGroup.items.push({ name: groupName, journeys: [j] });
        }
      } else {
        groups.push({ 
          month, 
          items: [{ name: groupName, journeys: [j] }] 
        });
      }
    });
    return groups;
  }, [groupJourneys, i18n.language, t]);


  const openJourney = (j: JourneyItem) => {
    if (legacyMode) {
      // Older history lives behind the older screens until the server has v2.
      if (j.groupJourneyId) router.push({ pathname: '/group-journey-detail', params: { groupJourneyId: j.groupJourneyId } } as any);
      else router.push({ pathname: '/journey-detail', params: { journeyId: j.id } } as any);
      return;
    }
    router.push({ pathname: '/ride-detail', params: { rideId: j.id } } as any);
  };

  const renderRide = (journey: JourneyItem, last: boolean, showMenu: boolean) => {
    const coverUri =
      journey.coverPhotoUrl ||
      journey.photos?.[0]?.thumbnailUrl ||
      journey.photos?.[0]?.imageUrl ||
      journey.photos?.[0]?.firebasePath;
    const displayTitle = journey.customTitle || journey.title || t('log.soloRideDefault');
    return (
      <View key={journey.id} style={styles.ride}>
        <View style={styles.rail}>
          <View style={[styles.marker, { backgroundColor: d.bg }]} />
          {!last && <View style={[styles.railLine, { borderColor: d.lane }]} />}
        </View>
        <Pressable onPress={() => openJourney(journey)} style={styles.rideBody}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.mono, { color: d.ink2, fontSize: 11 }]}>
              {formatDateLabel(journey.startTime)} · {getTimeLabel(journey.startTime)}
            </Text>
            <Text style={[styles.rideTitle, { color: d.ink }]} numberOfLines={2}>{displayTitle}</Text>
            <Text style={[styles.mono, { color: d.ink2 }]}>
              {formatDistance(journey.totalDistance)} · {formatDuration(journey.totalTime)}
            </Text>
          </View>
          <View style={[styles.thumb, { backgroundColor: d.surface2 }]}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.thumbImg} />
            ) : (
              <Icon name="route" size={24} color={AMBER} stroke={2.4} />
            )}
          </View>
        </Pressable>
        {showMenu && !legacyMode && (
          <JourneyCardMenu
            journeyId={journey.id}
            journeyTitle={displayTitle}
            onRename={() => loadData()}
            onDelete={loadData}
            iconColor={d.ink2}
            iconSize={18}
          />
        )}
      </View>
    );
  };

  const TABS = ['solo', 'group', 'challenges'] as const;

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={{ height: 296 }}>
          <Cut height={296} />
          <View style={[styles.title, { top: Math.max(56, insets.top + 8) }]}>
            <Text style={styles.h1}>{t('log.title', { defaultValue: 'Journey log' })}</Text>
          </View>
          <View style={[styles.rankBlock, { top: Math.max(56, insets.top + 8) + 64 }]}>
            <Text style={styles.eyebrow}>{t('log.globalRank')}</Text>
            <Text style={styles.rank}>{rank ? `#${rank}` : '--'}</Text>
          </View>
        </View>

        <View style={styles.nextBadge}>
          <View style={styles.nextIcon}>
            <View style={[styles.nextDiamond, { borderColor: d.ink2 }]}>
              <View style={{ transform: [{ rotate: '-45deg' }] }}>
                <Icon name="route" size={16} color={d.ink2} stroke={2} />
              </View>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.small, { color: d.ink2 }]}>{t('log.nextBadge')}</Text>
            <Text style={[styles.rideTitle, { color: d.ink, fontSize: 16 }]} numberOfLines={1}>{nextBadge}</Text>
          </View>
        </View>

        <View style={[styles.segment, { backgroundColor: d.surface2 }]} accessibilityRole="tablist">
          {TABS.map((tab) => {
            const on = activeTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setActiveTab(tab)}
                style={[styles.segItem, on && { backgroundColor: d.surface }]}
              >
                <Text style={{ fontFamily: on ? F.extra : F.bold, fontSize: 13, color: on ? d.ink : d.ink2 }}>
                  {t(`log.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {activeTab === 'solo' &&
            (groupedSoloByDate.length === 0 ? (
              <Text style={[styles.empty, { color: d.ink2 }]}>{loading ? '…' : t('log.noSoloRides')}</Text>
            ) : (
              groupedSoloByDate.map((g, gi) => (
                <View key={g.month} style={{ marginBottom: 8 }}>
                  <View style={styles.monthRow}>
                    <Text style={[styles.month, { color: d.ink2 }]}>{g.month}</Text>
                    <Text style={[styles.mono, { color: d.ink2 }]}>
                      {g.journeys.length} rides · {formatDistance(g.journeys.reduce((s, j) => s + (j.totalDistance || 0), 0))}
                    </Text>
                  </View>
                  {g.journeys.map((j, ji) =>
                    renderRide(j, gi === groupedSoloByDate.length - 1 && ji === g.journeys.length - 1, true)
                  )}
                </View>
              ))
            ))}

          {activeTab === 'group' &&
            (groupedGroupJourneys.length === 0 ? (
              <Text style={[styles.empty, { color: d.ink2 }]}>{t('log.noGroupRides')}</Text>
            ) : (
              groupedGroupJourneys.map((mg) => (
                <View key={mg.month} style={{ marginBottom: 8 }}>
                  <Text style={[styles.month, { color: d.ink2, marginBottom: 10 }]}>{mg.month}</Text>
                  {mg.items.map((grp) => (
                    <View key={grp.name} style={[styles.groupCard, { backgroundColor: d.surface, borderColor: d.line }]}>
                      <View style={styles.monthRow}>
                        <Text style={[styles.rideTitle, { color: d.ink }]}>{grp.name}</Text>
                        <Text style={[styles.mono, { color: d.ink2 }]}>{grp.journeys.length}</Text>
                      </View>
                      {grp.journeys.map((j) => (
                        <Pressable key={j.id} onPress={() => openJourney(j)} style={[styles.groupRide, { borderTopColor: d.line }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rideTitle, { color: d.ink, fontSize: 15 }]}>{formatDateLabel(j.startTime)}</Text>
                            <Text style={[styles.mono, { color: d.ink2 }]}>
                              {formatDistance(j.totalDistance)} · {formatDuration(j.totalTime)}
                            </Text>
                          </View>
                          <Icon name="chevron" size={18} color={d.ink2} />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              ))
            ))}

          {activeTab === 'challenges' && (
            <Text style={[styles.empty, { color: d.ink2 }]}>
              {t('log.challengesComingSoon') || 'Challenges coming soon'}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { position: 'absolute', left: 20, right: 20 },
  h1: { fontFamily: F.black, fontSize: 30, letterSpacing: -0.6, color: INK },
  rankBlock: { position: 'absolute', left: 20 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(26,24,20,0.72)' },
  rank: { fontFamily: F.black, fontSize: 72, lineHeight: 80, letterSpacing: -2.9, color: INK },
  nextBadge: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginTop: 4 },
  nextIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nextDiamond: { width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  small: { fontFamily: F.regular, fontSize: 12 },
  segment: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, padding: 4, borderRadius: 14, gap: 4, height: 44 },
  segItem: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, marginTop: 20 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6 },
  month: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1.7, textTransform: 'uppercase' },
  mono: { fontFamily: F.monoSemi, fontSize: 12 },
  ride: { flexDirection: 'row', alignItems: 'center' },
  rail: { width: 30, alignSelf: 'stretch', alignItems: 'flex-start' },
  marker: { position: 'absolute', left: 2, top: 28, width: 12, height: 12, borderRadius: 3, borderWidth: 2, borderColor: AMBER, transform: [{ rotate: '45deg' }] },
  railLine: { position: 'absolute', left: 7, top: 44, bottom: -28, borderLeftWidth: 2, borderStyle: 'dashed' },
  rideBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  rideTitle: { fontFamily: F.extra, fontSize: 17, letterSpacing: -0.2 },
  thumb: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: 60, height: 60 },
  groupCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  groupRide: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1 },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', paddingVertical: 40 },
});
