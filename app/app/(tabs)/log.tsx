import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useUserData } from '../../hooks/useUserData';
import { userAPI, leaderboardAPI } from '../../services/api';
import XPProgress from '../../components/ui/XPProgress';
import { Ionicons, Feather } from '@expo/vector-icons';

import { ACHIEVEMENT_BADGES } from '../../constants/achievements';
import { useTranslation } from 'react-i18next';
import JourneyCardMenu from '../../components/ui/JourneyCardMenu';
import AsyncStorage from '@react-native-async-storage/async-storage';

type JourneyItem = {
  id: string;
  title?: string;
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

const CACHE_KEY_LOG_DATA = 'wayfarian_log_screen_data';

export default function RideLogScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();
  const { convertDistance } = useSettings();
  
  const { dashboardData, refreshData: refreshUserData } = useUserData();

  const [activeTab, setActiveTab] = useState('solo');
  const [rank, setRank] = useState<number | null>(null);
  const [nextBadge, setNextBadge] = useState<string>('');
  const [badges, setBadges] = useState<{ id: string; title: string; achievementId: string }[]>([]);
  const [soloJourneys, setSoloJourneys] = useState<JourneyItem[]>([]);
  const [groupJourneys, setGroupJourneys] = useState<JourneyItem[]>([]);
  const [loading, setLoading] = useState(false);

  const processAndSetData = React.useCallback((positionRes: any, achievementsRes: any, historyRes: any) => {
    const position = positionRes?.position ?? positionRes?.rank ?? null;
    if (typeof position === 'number') setRank(position);

    let nextName = t('log.nextMilestone');
    const ach = achievementsRes?.achievements || [];
    for (const a of ach) {
      const locked = (a.tiers || []).find((tier: any) => !tier.unlocked);
      if (locked) { nextName = locked.name || a.name; break; }
    }
    setNextBadge(nextName);

    const unlockedBadges: { id: string; title: string; achievementId: string }[] = [];
    ach.forEach((a: any) => {
      (a.tiers || []).forEach((tier: any) => {
        if (tier.unlocked) unlockedBadges.push({ id: `${a.id}_${tier.level}`, title: tier.name || a.name, achievementId: a.id });
      });
    });
    setBadges(unlockedBadges.slice(0, 4));

    const journeys: JourneyItem[] = historyRes?.journeys || [];
    const solo = journeys.filter(j => !j.group);
    const group = journeys.filter(j => !!j.group);
    setSoloJourneys(solo);
    setGroupJourneys(group);
  }, [t]);

  const loadData = React.useCallback(async (useCache = true) => {
    if (!isAuthenticated) return;

    if (useCache) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY_LOG_DATA);
        if (cached) {
          const parsed = JSON.parse(cached);
          processAndSetData(parsed.positionRes, parsed.achievementsRes, parsed.historyRes);
        }
      } catch (e) {
        console.warn('Failed to load log cache', e);
      }
    }

    try {
      if (!soloJourneys.length && !groupJourneys.length) {
         setLoading(true);
      }

      const [positionRes, achievementsRes, historyRes] = await Promise.all([
        leaderboardAPI.getUserPosition(),
        userAPI.getAchievements(),
        userAPI.getJourneyHistory({ limit: 40, sortBy: 'startTime', sortOrder: 'desc' }),
      ]);

      processAndSetData(positionRes, achievementsRes, historyRes);

      AsyncStorage.setItem(CACHE_KEY_LOG_DATA, JSON.stringify({
        positionRes,
        achievementsRes,
        historyRes,
        timestamp: Date.now()
      })).catch(e => console.warn('Failed to save log cache', e));

    } catch (e) {
      console.warn('Log screen data load failed', e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, soloJourneys.length, groupJourneys.length, processAndSetData]);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
      refreshUserData();
    }, [loadData, refreshUserData])
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

  const renderTimelineNode = (journey: JourneyItem, isLast: boolean) => {
    const coverUri =
      journey.coverPhotoUrl ||
      journey.photos?.[0]?.thumbnailUrl ||
      journey.photos?.[0]?.imageUrl ||
      journey.photos?.[0]?.firebasePath;

    return (
      <View key={journey.id} style={styles.timelineNode}>
        <View style={styles.pathColumn}>
          <View style={styles.timelineDot} />
          {!isLast && <View style={styles.timelinePath} />}
        </View>

        <TouchableOpacity
          style={styles.nodeContent}
          activeOpacity={0.7}
          onPress={() => {
            router.push({
              pathname: '/journey-detail',
              params: { journeyId: journey.id }
            });
          }}
        >
          <View style={styles.nodeLeft}>
            <View style={styles.nodeHeader}>
              <Text style={styles.nodeTime}>{getTimeLabel(journey.startTime)}</Text>
              <JourneyCardMenu
                journeyId={journey.id}
                journeyTitle={journey.title || t('log.soloRideDefault')}
                onRename={() => loadData()}
                onDelete={() => {
                  setSoloJourneys(prev => prev.filter(j => j.id !== journey.id));
                }}
                iconColor="#CCC"
                iconSize={18}
              />
            </View>
            <Text style={styles.nodeTitle} numberOfLines={2}>
              {journey.title || t('log.soloRideDefault')}
            </Text>
            <View style={styles.nodeStats}>
              <Ionicons name="location-outline" size={12} color="#616161" style={{ marginRight: 4 }} />
              <Text style={styles.nodeStatText}>{formatDistance(journey.totalDistance)}</Text>
              <View style={styles.statDot} />
              <Ionicons name="time-outline" size={12} color="#616161" style={{ marginRight: 4 }} />
              <Text style={styles.nodeStatText}>{formatDuration(journey.totalTime)}</Text>
            </View>
          </View>

          <View style={styles.nodeRight}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.nodeThumb} />
            ) : (
              <LinearGradient
                colors={['#F9A825', '#FF8F00']}
                style={styles.nodeThumb}
              >
                <Ionicons name="map" size={24} color="#FFF" />
              </LinearGradient>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank ? `#${rank}` : '--'}</Text>
            <Text style={styles.rankLabel}>{t('log.globalRank')}</Text>
          </View>
          <View style={styles.headerXP}>
            <XPProgress
              xp={dashboardData?.user?.xp || 0}
              level={dashboardData?.user?.level || 1}
              compact
            />
          </View>
        </View>

        {/* Achievements Section */}
        <View style={styles.achievementsRow}>
          <View style={styles.achievementsList}>
            {badges.length > 0 ? (
              badges.map((badge) => (
                <View key={badge.id} style={styles.badgeWrapper}>
                  <Image 
                    source={ACHIEVEMENT_BADGES[badge.achievementId as keyof typeof ACHIEVEMENT_BADGES]} 
                    style={styles.miniBadge}
                    resizeMode="contain"
                  />
                </View>
              ))
            ) : (
              <Text style={styles.noBadgesText}>{t('log.noBadges')}</Text>
            )}
            {badges.length > 0 && (
              <TouchableOpacity 
                style={styles.moreBadges}
                onPress={() => router.push('/(tabs)/profile')}
              >
                <Ionicons name="chevron-forward" size={14} color="#9E9E9E" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.nextBadgeContainer}>
            <Text style={styles.nextBadgeLabel}>{t('log.nextBadge')}</Text>
            <Text style={styles.nextBadgeValue} numberOfLines={1}>{nextBadge}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabBar}>
        {['solo', 'group', 'challenges'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {t(`log.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView 
        style={styles.timelineContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.timelineContent}
      >
        {activeTab === 'solo' && (
          groupedSoloByDate.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="map" size={48} color="#EEE" />
              <Text style={styles.emptyText}>{t('log.noSoloRides')}</Text>
            </View>
          ) : (
            groupedSoloByDate.map((group, gIdx) => (
              <View key={group.month} style={styles.monthSection}>
                <Text style={styles.monthTitle}>{group.month}</Text>
                {group.journeys.map((j, jIdx) => 
                  renderTimelineNode(j, gIdx === groupedSoloByDate.length - 1 && jIdx === group.journeys.length - 1)
                )}
              </View>
            ))
          )
        )}

        {activeTab === 'group' && (
          groupedGroupJourneys.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="users" size={48} color="#EEE" />
              <Text style={styles.emptyText}>{t('log.noGroupRides')}</Text>
            </View>
          ) : (
            groupedGroupJourneys.map(monthGroup => (
              <View key={monthGroup.month} style={styles.monthSection}>
                <Text style={styles.monthTitle}>{monthGroup.month}</Text>
                {monthGroup.items.map(group => (
                  <View key={group.name} style={styles.groupTimelineCard}>
                    <View style={styles.groupCardHeader}>
                      <Text style={styles.groupCardTitle}>{group.name}</Text>
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>{group.journeys.length}</Text>
                      </View>
                    </View>
                    {group.journeys.map((j, idx) => (
                      <TouchableOpacity
                        key={j.id}
                        style={styles.groupRideItem}
                        onPress={() => {
                          if (j.groupJourneyId) {
                            router.push({
                              pathname: '/group-journey-detail',
                              params: { groupJourneyId: j.groupJourneyId },
                            } as any);
                          } else {
                            router.push({
                              pathname: '/journey-detail',
                              params: { journeyId: j.id },
                            });
                          }
                        }}
                      >
                        <View style={styles.groupRideDot} />
                        <View style={styles.groupRideContent}>
                          <Text style={styles.groupRideDate}>{formatDateLabel(j.startTime)}</Text>
                          <Text style={styles.groupRideStats}>
                            {formatDistance(j.totalDistance)} · {formatDuration(j.totalTime)}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#DDD" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            ))
          )
        )}

        {activeTab === 'challenges' && (
          <View style={styles.comingSoon}>
            <LinearGradient
              colors={['#FFF8E1', '#FFFDE7']}
              style={styles.comingSoonCard}
            >
              <Ionicons name="trophy-outline" size={40} color="#F9A825" />
              <Text style={styles.comingSoonTitle}>{t('log.challengesComingSoon') || 'Challenges Coming Soon'}</Text>
              <Text style={styles.comingSoonText}>Compete with friends and earn exclusive badges.</Text>
            </LinearGradient>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    gap: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    backgroundColor: '#000',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 15,
    minWidth: 70,
  },
  rankText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Space Grotesk',
  },
  rankLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  headerXP: {
    flex: 1,
  },
  achievementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  achievementsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  miniBadge: {
    width: 24,
    height: 24,
  },
  moreBadges: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  noBadgesText: {
    fontSize: 11,
    color: '#9E9E9E',
    fontFamily: 'Poppins',
    fontStyle: 'italic',
  },
  nextBadgeContainer: {
    alignItems: 'flex-end',
    flex: 1,
    marginLeft: 12,
  },
  nextBadgeLabel: {
    fontSize: 9,
    color: '#9E9E9E',
    fontWeight: '700',
    textTransform: 'uppercase',
    fontFamily: 'Space Grotesk',
  },
  nextBadgeValue: {
    fontSize: 12,
    color: '#F9A825',
    fontWeight: '700',
    fontFamily: 'Space Grotesk',
    marginTop: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFF',
  },
  tabItem: {
    paddingVertical: 14,
    marginRight: 28,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#F9A825',
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#BDBDBD',
    fontFamily: 'Space Grotesk',
  },
  tabLabelActive: {
    color: '#000',
  },
  timelineContainer: {
    flex: 1,
  },
  timelineContent: {
    padding: 20,
    paddingBottom: 100,
  },
  monthSection: {
    marginBottom: 32,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    fontFamily: 'Space Grotesk',
    marginBottom: 24,
    textTransform: 'capitalize',
  },
  timelineNode: {
    flexDirection: 'row',
    minHeight: 110,
  },
  pathColumn: {
    width: 24,
    alignItems: 'center',
    marginRight: 16,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F9A825',
    borderWidth: 3,
    borderColor: '#FFF',
    zIndex: 2,
    marginTop: 8,
    shadowColor: "#F9A825",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  timelinePath: {
    position: 'absolute',
    top: 14,
    bottom: -16,
    width: 2,
    backgroundColor: '#F0F0F0',
    zIndex: 1,
  },
  nodeContent: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FDFDFD',
    borderRadius: 20,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F5F5F5',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  nodeLeft: {
    flex: 1,
    paddingRight: 12,
  },
  nodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nodeTime: {
    fontSize: 11,
    color: '#9E9E9E',
    fontWeight: '700',
    fontFamily: 'Space Grotesk',
    textTransform: 'uppercase',
  },
  nodeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#212121',
    fontFamily: 'Space Grotesk',
    marginBottom: 8,
    lineHeight: 20,
  },
  nodeStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nodeStatText: {
    fontSize: 12,
    color: '#616161',
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
  statDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  nodeRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeThumb: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontFamily: 'Poppins',
  },
  groupTimelineCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  groupCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  groupCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
    fontFamily: 'Space Grotesk',
  },
  groupBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
  },
  groupRideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  groupRideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DDD',
    marginRight: 12,
  },
  groupRideContent: {
    flex: 1,
  },
  groupRideDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
    fontFamily: 'Space Grotesk',
  },
  groupRideStats: {
    fontSize: 11,
    color: '#9E9E9E',
    fontFamily: 'Poppins',
    marginTop: 2,
  },
  comingSoon: {
    paddingTop: 20,
  },
  comingSoonCard: {
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF59D',
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    fontFamily: 'Space Grotesk',
    marginTop: 16,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 13,
    color: '#616161',
    textAlign: 'center',
    fontFamily: 'Poppins',
    lineHeight: 20,
  },
});
