import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useUserData } from '../../hooks/useUserData';


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
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
      >
        {/* Background Image */}
        <View style={styles.backgroundImageContainer}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/pvtm78LBD6.png' }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/MN0Tj1LcZr.png' }}
            style={styles.profileImage}
          />
          <Text style={styles.logo}>LOGO</Text>
          <View style={styles.notificationContainer}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/dcUiUAEFXH.png' }}
              style={styles.notificationIcon}
            />
          </View>
        </View>

        {/* User Profile Section */}
        <View style={styles.profileSection}>
          <Image
            source={{ 
              uri: dashboardData?.user?.photoURL || user?.photoURL || 'https://static.codia.ai/image/2025-09-26/i2yG8AHX5c.png' 
            }}
            style={styles.userAvatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {dashboardData?.user?.displayName || user?.displayName || 'User'}
            </Text>
            <Text style={styles.userRank}>Explorer Rank</Text>
            <Text style={styles.userStats}>
              {formatDistance(dashboardData?.user?.totalDistance || 0)} | {formatTime(dashboardData?.user?.totalTime || 0)} | {achievements.length} Badges
            </Text>
          </View>
        </View>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Distance Covered</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  formatDistance(dashboardData?.user?.totalDistance || 0)
                )}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Time Traveled</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <ActivityIndicator size="small" color="#000000" />
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
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  formatSpeed((dashboardData?.user?.totalDistance || 0) / Math.max((dashboardData?.user?.totalTime || 1) / 3600, 0.1))
                )}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Max Speed</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  formatSpeed(dashboardData?.user?.topSpeed || 0)
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* XP Progress Section */}
        <View style={styles.xpSection}>
          <Text style={styles.xpTitle}>XP Progress</Text>
          <View style={styles.progressBarContainer}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/pyH5pJcAte.png' }}
              style={styles.progressBar}
              resizeMode="stretch"
            />
          </View>
          <Text style={styles.nextBadge}>Next Badge: Explorer</Text>
        </View>

        {/* Achievements Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Achievements</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.achievementsScroll}>
          <View style={styles.achievementsContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#F9A825" />
                <Text style={styles.loadingText}>Loading achievements...</Text>
              </View>
            ) : achievements.length > 0 ? (
              achievements.slice(0, 3).map((achievement, index) => (
                <View key={achievement.id} style={styles.achievementCard}>
                  <View style={styles.achievementImagePlaceholder}>
                    <Text style={styles.achievementEmoji}>{achievement.icon}</Text>
                  </View>
                  <View style={styles.achievementInfo}>
                    <Text style={styles.achievementTitle}>{achievement.name}</Text>
                    <Text style={styles.achievementDescription}>{achievement.description}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No achievements yet</Text>
                <Text style={styles.emptySubtext}>Start your first journey to unlock achievements!</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Past Journeys Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Past Journeys</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.journeysScroll}>
          <View style={styles.journeysContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#F9A825" />
                <Text style={styles.loadingText}>Loading journeys...</Text>
              </View>
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

        {/* Start Journey Button */}
        <View style={styles.startJourneyContainer}>
          <TouchableOpacity style={styles.startJourneyButton}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/PdS2AJiDCo.png' }}
              style={styles.startJourneyIcon}
            />
            <Text style={styles.startJourneyText}>Start Journey</Text>
          </TouchableOpacity>
        </View>
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
  xpTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 24,
  },
  progressBarContainer: {
    height: 8,
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
