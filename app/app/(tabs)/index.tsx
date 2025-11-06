import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useUserData } from '../../hooks/useUserData';
import { ACHIEVEMENT_BADGES } from '../../constants/achievements';
import { router } from 'expo-router';
import { Skeleton, SkeletonCircle, SkeletonLine } from '../../components/Skeleton';
import FloatingJourneyStatus from '../../components/FloatingJourneyStatus';


export default function HomeScreen(): React.JSX.Element {
  const { user, isAuthenticated } = useAuth();
  const { dashboardData, achievements, loading, refreshData } = useUserData();

  const formatDistance = (distance: number) => {
    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(1)}K km`;
    }
    return `${distance.toFixed(0)} km`;
  };

  const formatTime = (timeInSeconds: number) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatSpeed = (speed: number) => {
    return `${speed.toFixed(0)} km/h`;
  };

  const onRefresh = async () => {
    await refreshData();
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Please log in to view your dashboard</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Show mini floating bar on Home when a current journey exists */}
      <FloatingJourneyStatus homeOnly />
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
      >
        {/* Background Image */}
        <View style={styles.backgroundImageContainer}>
          <Image
            source={require('../../assets/images/2025-09-26/pvtm78LBD6.png')}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7}>
            <Image
              source={require('../../assets/images/2025-09-26/MN0Tj1LcZr.png')}
              style={styles.profileImage}
            />
          </TouchableOpacity>
          <Text style={styles.logo}>LOGO</Text>
          <View style={styles.notificationContainer}>
            <Image
              source={require('../../assets/images/2025-09-26/dcUiUAEFXH.png')}
              style={styles.notificationIcon}
            />
          </View>
        </View>

        {/* User Profile Section */}
        <TouchableOpacity style={styles.profileSection} activeOpacity={0.8} onPress={() => router.push('/profile')}>
          <Image
            source={{ 
              uri: dashboardData?.user?.photoURL || user?.photoURL || require('../../assets/images/2025-09-26/i2yG8AHX5c.png') 
            }}
            style={styles.userAvatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {dashboardData?.user?.displayName || user?.displayName || 'User'}
            </Text>
            <Text style={styles.userRank}>Explorer Rank</Text>
            <Text style={styles.userStats}>
              {formatDistance(dashboardData?.user?.totalDistance || 0)} | {formatTime(dashboardData?.user?.totalTime || 0)} | {achievements.filter(a => a.unlocked).length} Badges
            </Text>
          </View>
        </TouchableOpacity>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Distance Covered</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={80} height={16} />
                ) : (
                  formatDistance(dashboardData?.user?.totalDistance || 0)
                )}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Time Traveled</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={70} height={16} />
                ) : (
                  formatTime(dashboardData?.user?.totalTime || 0)
                )}
              </Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg. Speed</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={60} height={16} />
                ) : (
                  formatSpeed((dashboardData?.user?.totalDistance || 0) / Math.max((dashboardData?.user?.totalTime || 1) / 3600, 0.1))
                )}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Max Speed</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={60} height={16} />
                ) : (
                  formatSpeed(dashboardData?.user?.topSpeed || 0)
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* XP Progress Section */}
        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpTitle}>Level {dashboardData?.user?.level || 1}</Text>
            <Text style={styles.xpValue}>{dashboardData?.user?.xp || 0} XP</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${Math.min(100, ((dashboardData?.user?.xp || 0) % 100))}%` 
                  }
                ]} 
              />
            </View>
          </View>
          <Text style={styles.nextBadge}>
            {loading ? <SkeletonLine width={160} height={12} /> : `${100 - ((dashboardData?.user?.xp || 0) % 100)} XP to Level ${(dashboardData?.user?.level || 1) + 1}`}
          </Text>
        </View>

        {/* Achievements Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Achievements</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.achievementsScroll}>
          <View style={styles.achievementsContainer}>
            {loading ? (
              <>
                {[0,1,2].map((i) => (
                  <View key={i} style={styles.achievementCard}>
                    <View style={styles.achievementImagePlaceholder}>
                      <SkeletonCircle size={60} />
                    </View>
                    <View style={styles.achievementInfo}>
                      <SkeletonLine width={120} height={14} style={{ marginBottom: 6 }} />
                      <SkeletonLine width={180} height={12} />
                    </View>
                  </View>
                ))}
              </>
            ) : (() => {
                // Filter to only show unlocked/earned achievements
                const unlockedAchievements = achievements.filter(achievement => achievement.unlocked === true);
                
                return unlockedAchievements.length > 0 ? (
                  unlockedAchievements.slice(0, 3).map((achievement, index) => {
                    // Get badge image from mapping
                    const badgeSource = achievement.badge 
                      ? ACHIEVEMENT_BADGES[achievement.id as keyof typeof ACHIEVEMENT_BADGES]
                      : null;
                    
                    return (
                      <View key={achievement.id} style={styles.achievementCard}>
                        <View style={styles.achievementImagePlaceholder}>
                          {badgeSource ? (
                            <Image 
                              source={badgeSource}
                              style={styles.achievementBadgeImage}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={styles.achievementEmoji}>🏆</Text>
                          )}
                        </View>
                        <View style={styles.achievementInfo}>
                          <Text style={styles.achievementTitle}>{achievement.name}</Text>
                          <Text style={styles.achievementDescription}>{achievement.description}</Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No achievements unlocked yet</Text>
                    <Text style={styles.emptySubtext}>Start your first journey to unlock achievements!</Text>
                  </View>
                );
              })()}
          </View>
        </ScrollView>

        {/* Past Journeys Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Past Journeys</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.journeysScroll}>
          <View style={styles.journeysContainer}>
            {loading ? (
              <>
                {[0,1,2].map((i) => (
                  <View key={i} style={styles.journeyCard}>
                    <View style={styles.journeyImagePlaceholder}>
                      <Skeleton width={165} height={80} borderRadius={5} />
                    </View>
                    <View style={styles.journeyInfo}>
                      <SkeletonLine width={140} height={16} style={{ marginBottom: 8 }} />
                      <SkeletonLine width={100} height={12} />
                    </View>
                  </View>
                ))}
              </>
            ) : dashboardData?.recentJourneys && dashboardData.recentJourneys.length > 0 ? (
              dashboardData.recentJourneys.map((journey, index) => (
                <View key={journey.id} style={styles.journeyCard}>
                  <View style={styles.journeyImagePlaceholder}>
                    <Text style={styles.journeyEmoji}>🚗</Text>
                  </View>
                  <View style={styles.journeyInfo}>
                    <Text style={styles.journeyTitle}>
                      {journey.title || `Journey ${index + 1}`}
                    </Text>
                    <Text style={styles.journeyStats}>
                      {formatDistance(journey.totalDistance || 0)} | {formatTime(journey.totalTime || 0)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No journeys yet</Text>
                <Text style={styles.emptySubtext}>Start your first journey to see it here!</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  backgroundImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 516,
    zIndex: -1,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 27,
    paddingBottom: 11,
  },
  profileImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  logo: {
    flex: 1,
    marginLeft: 7,
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '400',
    color: '#000000',
    lineHeight: 22,
  },
  notificationContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  notificationIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 17,
  },
  userAvatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  userName: {
    fontFamily: 'Space Grotesk',
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 28,
    marginBottom: 2,
  },
  userRank: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '400',
    color: '#757575',
    lineHeight: 24,
    marginBottom: 2,
  },
  userStats: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '400',
    color: '#757575',
    lineHeight: 24,
  },
  statsContainer: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    padding: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 2.2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  statLabel: {
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 24,
  },
  statValue: {
    fontFamily: 'Digital Numbers',
    fontSize: 20,
    fontWeight: '400',
    color: '#000000',
    lineHeight: 30,
  },
  xpSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 24,
  },
  xpValue: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '600',
    color: '#6366f1',
    lineHeight: 24,
  },
  progressBarContainer: {
    height: 12,
  },
  progressBarBackground: {
    width: '100%',
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 6,
  },
  progressBar: {
    width: '100%',
    height: 8,
  },
  nextBadge: {
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    lineHeight: 21,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 28,
  },
  achievementsScroll: {
    paddingLeft: 16,
  },
  achievementsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  achievementCard: {
    width: 160,
    borderRadius: 8,
    gap: 16,
  },
  achievementImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
  },
  achievementInfo: {
    gap: 0,
  },
  achievementTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 24,
  },
  achievementDescription: {
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    lineHeight: 21,
  },
  journeysScroll: {
    paddingLeft: 16,
  },
  journeysContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  journeyCard: {
    width: 160,
    borderRadius: 8,
    gap: 16,
  },
  journeyImage: {
    width: 160,
    height: 90,
    borderRadius: 8,
  },
  journeyInfo: {
    gap: 0,
  },
  journeyTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 24,
  },
  journeyStats: {
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    lineHeight: 21,
  },
  startJourneyContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginTop: 20,
  },
  startJourneyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(62, 71, 81, 0.9)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 24,
    gap: 16,
  },
  startJourneyIcon: {
    width: 24,
    height: 24,
  },
  startJourneyText: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
  },
  loadingContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
  },
  emptyContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
  },
  achievementImagePlaceholder: {
    width: 160,
    height: 160,
    backgroundColor: 'rgba(249, 168, 37, 0.1)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementEmoji: {
    fontSize: 48,
  },
  achievementBadgeImage: {
    width: 60,
    height: 60,
  },
  journeyImagePlaceholder: {
    width: 160,
    height: 90,
    backgroundColor: 'rgba(62, 71, 81, 0.1)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  journeyEmoji: {
    fontSize: 32,
  },
});
