import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { userAPI, leaderboardAPI } from '../../services/api';

type JourneyItem = {
  id: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  totalDistance?: number;
  totalTime?: number;
  group?: { id: string; name: string } | null;
};

export default function RideLogScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('solo');
  const [rank, setRank] = useState<number | null>(null);
  const [xpProgress, setXpProgress] = useState<number>(0);
  const [nextBadge, setNextBadge] = useState<string>('');
  const [badges, setBadges] = useState<{ id: string; title: string; imageUrl?: string }[]>([]);
  const [soloJourneys, setSoloJourneys] = useState<JourneyItem[]>([]);
  const [groupJourneys, setGroupJourneys] = useState<JourneyItem[]>([]);
  const [, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const load = async () => {
      try {
        setLoading(true);
        const [positionRes, achievementsRes, historyRes] = await Promise.all([
          leaderboardAPI.getUserPosition(),
          userAPI.getAchievements(),
          userAPI.getJourneyHistory({ limit: 20, sortBy: 'startTime', sortOrder: 'desc' }),
        ]);

        const position = positionRes?.position ?? positionRes?.rank ?? null;
        if (typeof position === 'number') setRank(position);

        // XP Progress and next badge
        const progressPct = parseFloat(achievementsRes?.summary?.progress || '0');
        setXpProgress(Number.isFinite(progressPct) ? progressPct : 0);

        // Find next locked tier name as next badge
        let nextName = 'Next milestone';
        const ach = achievementsRes?.achievements || [];
        for (const a of ach) {
          const locked = (a.tiers || []).find((t: any) => !t.unlocked);
          if (locked) { nextName = locked.name || a.name; break; }
        }
        setNextBadge(nextName);

        // Build badges from unlocked tiers (top 4)
  const unlockedBadges: { id: string; title: string }[] = [];
        ach.forEach((a: any) => {
          (a.tiers || []).forEach((t: any) => {
            if (t.unlocked) unlockedBadges.push({ id: `${a.id}_${t.level}`, title: t.name || a.name });
          });
        });
        setBadges(unlockedBadges.slice(0, 4));

        // Split journeys into solo vs group
        const journeys: JourneyItem[] = historyRes?.journeys || [];
        const solo = journeys.filter(j => !j.group).slice(0, 5);
        const group = journeys.filter(j => !!j.group).slice(0, 5);
        setSoloJourneys(solo);
        setGroupJourneys(group);

      } catch (e) {
        console.warn('Log screen data load failed', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAuthenticated]);

  const formattedProgressWidth = useMemo(() => `${Math.min(100, Math.max(0, xpProgress))}%`, [xpProgress]);

  const formatDistance = (km?: number) => {
    if (!km || km <= 0) return '0 km';
    return `${km.toFixed(1)} km`;
  };
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Progress Card with Rank and XP from backend */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.explorerBadge}>{rank ? `Rank #${rank}` : 'Rank —'}</Text>
          </View>
          <Text style={styles.progressSubtitle}>The road is your XP — keep going buddy!</Text>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: formattedProgressWidth as any }]} />
            </View>
          </View>
          <Text style={styles.nextBadgeText}>Next badge: <Text style={styles.trailblazerText}>{nextBadge || '—'}</Text></Text>
        </View>
        
        {/* Badges Section */}
        <View style={styles.badgesSection}>
          <View style={styles.badgesGrid}>
            {badges.length === 0 ? (
              <Text style={styles.badgeTitle}>No badges yet — start riding!</Text>
            ) : (
              badges.map((badge) => (
                <View key={badge.id} style={styles.badgeContainer}>
                  <View style={[styles.badgeImage, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 20 }}>🏅</Text>
                  </View>
                  {badge.title ? <Text style={styles.badgeTitle}>{badge.title}</Text> : null}
                </View>
              ))
            )}
          </View>
        </View>

        {/* Tabs Container */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'solo' && styles.activeTab]}
            onPress={() => setActiveTab('solo')}
          >
            <Text style={[styles.tabText, activeTab === 'solo' && styles.activeTabText]}>
              Solo rides
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'group' && styles.activeTab]}
            onPress={() => setActiveTab('group')}
          >
            <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>
              Group rides
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'challenges' && styles.activeTab]}
            onPress={() => setActiveTab('challenges')}
          >
            <Text style={[styles.tabText, activeTab === 'challenges' && styles.activeTabText]}>
              My challenges
            </Text>
          </TouchableOpacity>
        </View>

        {/* Rides Sections */}
        {activeTab === 'solo' && (
          <View style={styles.challengesSection}>
            {soloJourneys.length === 0 ? (
              <Text style={styles.badgeTitle}>No solo rides yet</Text>
            ) : (
              soloJourneys.map((j) => (
                <View key={j.id} style={styles.challengeCard}>
                  <Image source={{uri: 'https://static.codia.ai/image/2025-10-15/9X5p0f7nOs.png'}} style={styles.challengeImage} />
                  <View style={styles.challengeContent}>
                    <Text style={styles.challengeTitle}>{j.title || 'Solo Ride'}</Text>
                    <Text style={styles.challengeDuration}>{formatDuration(j.totalTime)}</Text>
                    <Text style={styles.challengeDistance}>{formatDistance(j.totalDistance)}</Text>
                    <View style={styles.challengeProgressContainer}>
                      <Text style={styles.challengeStatus}>{new Date(j.startTime || '').toDateString()}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'group' && (
          <View style={styles.challengesSection}>
            {groupJourneys.length === 0 ? (
              <Text style={styles.badgeTitle}>No group rides yet</Text>
            ) : (
              groupJourneys.map((j) => (
                <View key={j.id} style={styles.challengeCard}>
                  <Image source={{uri: 'https://static.codia.ai/image/2025-10-15/4G6hGQ8wZ0.png'}} style={styles.challengeImage} />
                  <View style={styles.challengeContent}>
                    <Text style={styles.challengeTitle}>{j.title || j.group?.name || 'Group Ride'}</Text>
                    <Text style={styles.challengeDuration}>{formatDuration(j.totalTime)}</Text>
                    <Text style={styles.challengeDistance}>{formatDistance(j.totalDistance)}</Text>
                    <View style={styles.challengeProgressContainer}>
                      <Text style={styles.challengeStatus}>{j.group?.name || ''}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'challenges' && (
          <View style={[styles.challengesSection, { alignItems: 'center' }]}>
            <Text style={styles.challengeTitle}>Coming soon</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  progressCard: {
    marginHorizontal: 15,
    marginTop: 16,
    backgroundColor: '#F9A825',
    borderRadius: 10,
    padding: 18,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 5,
  },
  explorerBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
  },
  progressSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    marginBottom: 16,
  },
  progressBarContainer: {
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  progressBarFill: {
    height: '100%',
    width: '63.6%', // 203/319 from Figma
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    textAlign: 'right',
  },
  trailblazerText: {
    fontWeight: '700',
  },
  badgesSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  badgesGrid: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 16,
  },
  badgeContainer: {
    alignItems: 'center',
  },
  badgeImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  badgeTitle: {
    fontSize: 10,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    textAlign: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginTop: 20,
    marginBottom: 20,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#F9A825',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  activeTabText: {
    color: '#000000',
  },
  challengesSection: {
    paddingHorizontal: 16,
    gap: 16,
  },
  challengeCard: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    marginBottom: 16,
  },
  challengeImage: {
    width: 165,
    height: 80,
    borderRadius: 5,
    marginRight: 12,
  },
  challengeContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 4,
  },
  challengeDuration: {
    fontSize: 10,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    marginBottom: 2,
  },
  challengeDistance: {
    fontSize: 10,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    marginBottom: 8,
  },
  challengeProgressContainer: {
    alignItems: 'flex-end',
  },
  challengeProgressBar: {
    width: 180,
    height: 2,
    backgroundColor: '#D9D9D9',
    borderRadius: 5,
    marginBottom: 4,
  },
  challengeProgressFill: {
    height: '100%',
    width: '36%', // 65/180 from Figma
    backgroundColor: '#F9A825',
    borderRadius: 5,
  },
  challengeStatus: {
    fontSize: 5,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  viewAllButton: {
    marginHorizontal: 142,
    marginTop: 20,
    backgroundColor: '#F9A825',
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: 106,
    height: 28,
  },
  viewAllText: {
    fontSize: 8,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
  },
});

