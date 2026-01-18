import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useUserData } from '../../hooks/useUserData';
import { ACHIEVEMENT_BADGES } from '../../constants/achievements';
import { router } from 'expo-router';
import { Skeleton, SkeletonCircle, SkeletonLine } from '../../components/Skeleton';
import { useTranslation } from 'react-i18next';
import FloatingJourneyStatus from '../../components/FloatingJourneyStatus';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { useSettings } from '../../contexts/SettingsContext';
import JourneyCardMenu from '../../components/ui/JourneyCardMenu';
import AnimatedLogoButton from '../../components/AnimatedLogoButton';


export default function HomeScreen(): React.JSX.Element {
  const { user, isAuthenticated } = useAuth();
  const { dashboardData, achievements, loading, statsLoading, refreshData } = useUserData();
  const { convertDistance, convertSpeed } = useSettings();
  const { t } = useTranslation();

  const normalizeDistance = (value: number) => {
    if (!value) return 0;
    // API returns distance in kilometers, use as-is
    return value;
  };

  const formatTime = (timeInSeconds: number) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const onRefresh = async () => {
    await refreshData();
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{t('home.pleaseLogin')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
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
            source={require("../../assets/images/2025-09-26/pvtm78LBD6.png")}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.header}>
          {/* User Profile Picture - Replaced with Logo */}
          <AnimatedLogoButton 
            size={38} 
            padding={0}
            containerStyle={styles.logoButtonContainer}
          />
          <Text style={styles.headerUserName} numberOfLines={1}>
            {dashboardData?.user?.displayName || user?.displayName || "User"}
          </Text>
          <TouchableOpacity style={styles.notificationContainer} onPress={() => router.push('/settings')}>
            <Image
              source={require("../../assets/images/2025-09-26/dcUiUAEFXH.png")}
              style={styles.notificationIcon}
            />
          </TouchableOpacity>
        </View>

        {/* User Profile Section */}
        <TouchableOpacity
          style={styles.profileSection}
          activeOpacity={0.8}
          onPress={() => router.push("/profile")}
        >
          <Image
            source={
              dashboardData?.user?.photoURL || user?.photoURL
                ? { uri: dashboardData?.user?.photoURL || user?.photoURL }
                : require("../../assets/images/2025-09-26/i2yG8AHX5c.png")
            }
            style={styles.userAvatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {dashboardData?.user?.displayName || user?.displayName || "User"}
            </Text>
            <Text style={styles.userRank}>{t('home.explorerRank')}</Text>
            <Text style={styles.userStats}>
              {convertDistance(normalizeDistance(dashboardData?.user?.totalDistance || 0))} |{" "}
              {formatTime(dashboardData?.user?.totalTime || 0)} |{" "}
              {achievements.filter((a) => 
                a.unlocked === true || 
                (a.tiers && Array.isArray(a.tiers) && a.tiers.some(t => t.unlocked === true))
              ).length} {t('home.badges')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>{t('home.distanceCovered')}</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={80} height={16} />
                ) : (
                  convertDistance(normalizeDistance(dashboardData?.user?.totalDistance || 0))
                )}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>{t('home.timeTraveled')}</Text>
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
              <Text style={styles.statLabel}>{t('home.avgSpeed')}</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={60} height={16} />
                ) : (
                  convertSpeed(
                    (normalizeDistance(dashboardData?.user?.totalDistance || 0)) /
                      Math.max(
                        (dashboardData?.user?.totalTime || 1) / 3600,
                        0.1
                      )
                  )
                )}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>{t('home.maxSpeed')}</Text>
              <Text style={styles.statValue}>
                {loading ? (
                  <SkeletonLine width={60} height={16} />
                ) : (
                  convertSpeed(dashboardData?.user?.topSpeed || 0)
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* XP Progress Section */}
        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpTitle}>
              {t('home.level')} {dashboardData?.user?.level || 1}
            </Text>
            <Text style={styles.xpValue}>
              {dashboardData?.user?.xp || 0} {t('home.xp')}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(
                      100,
                      (dashboardData?.user?.xp || 0) % 100
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>
          <Text style={styles.nextBadge}>
            {loading ? (
              <SkeletonLine width={160} height={12} />
            ) : (
              t('home.xpToNextLevel', {
                xp: 100 - ((dashboardData?.user?.xp || 0) % 100),
                level: (dashboardData?.user?.level || 1) + 1
              })
            )}
          </Text>
        </View>

        {/* Achievements Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>{t('home.achievements')}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.achievementsScroll}
        >
          <View style={styles.achievementsContainer}>
            {(loading || statsLoading) ? (
              <>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.achievementCard}>
                    <View style={styles.achievementImagePlaceholder}>
                      <SkeletonCircle size={60} />
                    </View>
                    <View style={styles.achievementInfo}>
                      <SkeletonLine
                        width={120}
                        height={14}
                        style={{ marginBottom: 6 }}
                      />
                      <SkeletonLine width={180} height={12} />
                    </View>
                  </View>
                ))}
              </>
            ) : (
              (() => {
                // Filter to show achievements that have at least one unlocked tier
                const unlockedAchievements = achievements.filter(
                  (achievement) => {
                    // Check if achievement has direct unlocked property
                    if (achievement.unlocked === true) return true;
                    // Check if any tier is unlocked
                    if (achievement.tiers && Array.isArray(achievement.tiers)) {
                      return achievement.tiers.some(tier => tier.unlocked === true);
                    }
                    return false;
                  }
                );

                return unlockedAchievements.length > 0 ? (
                  unlockedAchievements.slice(0, 3).map((achievement) => {
                    // Get badge image from mapping
                    const badgeSource = achievement.badge
                      ? ACHIEVEMENT_BADGES[
                          achievement.id as keyof typeof ACHIEVEMENT_BADGES
                        ]
                      : null;

                    // Get highest unlocked tier for description
                    let description = achievement.description;
                    if (achievement.tiers && Array.isArray(achievement.tiers)) {
                      const unlockedTiers = achievement.tiers
                        .filter(t => t.unlocked)
                        .sort((a, b) => b.level - a.level);
                      if (unlockedTiers.length > 0) {
                        const tier = unlockedTiers[0];
                        description = tier.name || `Tier ${tier.level} - ${achievement.description}`;
                      }
                    }

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
                            <Ionicons name="trophy" size={40} color="#FFD700" />
                          )}
                        </View>
                        <View style={styles.achievementInfo}>
                          <Text style={styles.achievementTitle}>
                            {achievement.name}
                          </Text>
                          <Text style={styles.achievementDescription}>
                            {description}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {t('home.noAchievements')}
                    </Text>
                    <Text style={styles.emptySubtext}>
                      {t('home.startFirstJourney')}
                    </Text>
                  </View>
                );
              })()
            )}
          </View>
        </ScrollView>

        {/* Past Journeys Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.pastJourneys')}</Text>
            {dashboardData?.recentJourneys &&
              dashboardData.recentJourneys.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push("/PastJourneysScreen")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seeAllText}>{t('home.seeAll')}</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.journeysScroll}
        >
          <View style={styles.journeysContainer}>
            {(loading || statsLoading) ? (
              <>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.journeyCard}>
                    <View style={styles.journeyImagePlaceholder}>
                      <Skeleton width={165} height={80} borderRadius={5} />
                    </View>
                    <View style={styles.journeyInfo}>
                      <SkeletonLine
                        width={140}
                        height={16}
                        style={{ marginBottom: 8 }}
                      />
                      <SkeletonLine width={100} height={12} />
                    </View>
                  </View>
                ))}
              </>
            ) : dashboardData?.recentJourneys &&
              dashboardData.recentJourneys.length > 0 ? (
              dashboardData.recentJourneys.map((journey, index) => (
                <TouchableOpacity
                  key={journey.id}
                  style={styles.journeyCard}
                  onPress={() => router.push(`/journey-detail?journeyId=${journey.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.journeyImagePlaceholder}>
                    {(() => {
                      const coverUri =
                        journey.coverPhotoUrl ||
                        journey.photos?.[0]?.thumbnailUrl ||
                        journey.photos?.[0]?.imageUrl ||
                        journey.photos?.[0]?.firebasePath;
                      const journeyTitle = journey.title || `Journey ${index + 1}`;
                      return coverUri ? (
                        <Image source={{ uri: coverUri }} style={styles.journeyImageFull} />
                      ) : (
                        <LinearGradient
                          colors={['#F9A825', '#FF6F00']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.journeyGradientPlaceholder}
                        >
                          <Text style={styles.journeyGradientTitle} numberOfLines={2}>
                            {journeyTitle}
                          </Text>
                        </LinearGradient>
                      );
                    })()}
                    <JourneyCardMenu
                      journeyId={journey.id}
                      journeyTitle={journey.title || `Journey ${index + 1}`}
                      onRename={() => refreshData()}
                      onDelete={() => refreshData()}
                      iconColor="#757575"
                      iconSize={16}
                    />
                  </View>
                  <View style={styles.journeyInfo}>
                    <Text style={styles.journeyTitle} numberOfLines={1}>
                      {journey.title || `Journey ${index + 1}`}
                    </Text>
                    <Text style={styles.journeyStats}>
                      {convertDistance(normalizeDistance(journey.totalDistance || 0))} |{" "}
                      {formatTime(journey.totalTime || 0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('home.noJourneys')}</Text>
                <Text style={styles.emptySubtext}>
                  {t('home.startJourneyPrompt')}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
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
    height: verticalScale(516),
    zIndex: -1,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(40),
    paddingBottom: verticalScale(11),
  },
  logoButtonContainer: {
    padding: scale(5),
    borderRadius: scale(50),
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  headerProfileContainer: {
    padding: scale(3),
    borderRadius: scale(22),
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  headerProfileImage: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
  },
  headerUserName: {
    flex: 1,
    marginLeft: scale(10),
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#000000',
    lineHeight: verticalScale(22),
  },
  profileImage: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
  },
  logo: {
    flex: 1,
    marginLeft: scale(7),
    fontFamily: 'Inter',
    fontSize: moderateScale(18),
    fontWeight: '400',
    color: '#000000',
    lineHeight: verticalScale(22),
  },
  notificationContainer: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  notificationIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(16),
    marginTop: verticalScale(17),
  },
  userAvatar: {
    width: scale(128),
    height: scale(128),
    borderRadius: scale(64),
  },
  userInfo: {
    flex: 1,
    marginLeft: scale(16),
    justifyContent: 'center',
  },
  userName: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(22),
    fontWeight: '700',
    color: '#000000',
    lineHeight: verticalScale(28),
    marginBottom: verticalScale(2),
  },
  userRank: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '400',
    color: '#757575',
    lineHeight: verticalScale(24),
    marginBottom: verticalScale(2),
  },
  userStats: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '400',
    color: '#757575',
    lineHeight: verticalScale(24),
  },
  statsContainer: {
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(16),
    gap: verticalScale(16),
  },
  statsRow: {
    flexDirection: 'row',
    gap: scale(16),
  },
  statCard: {
    flex: 1,
    // On Android, semi-transparent backgrounds cause the shadow to be visible *through* the card,
    // which looks "dirty". We use solid white on Android to ensure a crisp shadow.
    backgroundColor: Platform.OS === 'android' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)',
    borderRadius: scale(12),
    padding: scale(24),
    gap: verticalScale(8),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
        shadowColor: '#000000',
        shadowOpacity: 0.2,
      },
    }),
  },
  statLabel: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(14),
    fontWeight: '500',
    color: '#000000',
    lineHeight: verticalScale(24),
  },
  statValue: {
    fontFamily: 'Digital Numbers',
    fontSize: moderateScale(20),
    fontWeight: '400',
    color: '#000000',
    lineHeight: verticalScale(30),
  },
  xpSection: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: verticalScale(12),
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: '#000000',
    lineHeight: verticalScale(24),
  },
  xpValue: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#6366f1',
    lineHeight: verticalScale(24),
  },
  progressBarContainer: {
    height: verticalScale(12),
  },
  progressBarBackground: {
    width: '100%',
    height: verticalScale(12),
    backgroundColor: '#E5E7EB',
    borderRadius: scale(6),
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: scale(6),
  },
  progressBar: {
    width: '100%',
    height: verticalScale(8),
  },
  nextBadge: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(14),
    fontWeight: '400',
    color: '#757575',
    lineHeight: verticalScale(21),
  },
  sectionContainer: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(12),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(22),
    fontWeight: '700',
    color: '#000000',
    lineHeight: verticalScale(28),
  },
  seeAllText: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#6366f1',
    lineHeight: verticalScale(21),
  },
  achievementsScroll: {
    paddingLeft: scale(16),
  },
  achievementsContainer: {
    flexDirection: 'row',
    gap: scale(12),
    paddingRight: scale(16),
  },
  achievementCard: {
    width: scale(160),
    borderRadius: scale(8),
    gap: verticalScale(16),
  },
  achievementImage: {
    width: scale(160),
    height: scale(160),
    borderRadius: scale(8),
  },
  achievementInfo: {
    gap: 0,
  },
  achievementTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '500',
    color: '#000000',
    lineHeight: verticalScale(24),
  },
  achievementDescription: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(14),
    fontWeight: '400',
    color: '#757575',
    lineHeight: verticalScale(21),
  },
  journeysScroll: {
    paddingLeft: scale(16),
  },
  journeysContainer: {
    flexDirection: 'row',
    gap: scale(12),
    paddingRight: scale(16),
  },
  journeyCard: {
    width: scale(160),
    borderRadius: scale(8),
    gap: verticalScale(16),
  },
  journeyImage: {
    width: scale(160),
    height: verticalScale(90),
    borderRadius: scale(8),
  },
  journeyInfo: {
    gap: 0,
  },
  journeyTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '500',
    color: '#000000',
    lineHeight: verticalScale(24),
  },
  journeyStats: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(14),
    fontWeight: '400',
    color: '#757575',
    lineHeight: verticalScale(21),
  },
  startJourneyContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(20),
    marginTop: verticalScale(20),
  },
  startJourneyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(62, 71, 81, 0.9)',
    borderRadius: scale(12),
    paddingVertical: verticalScale(16),
    paddingLeft: scale(16),
    paddingRight: scale(24),
    gap: scale(16),
  },
  startJourneyIcon: {
    width: scale(24),
    height: scale(24),
  },
  startJourneyText: {
    fontFamily: 'Space Grotesk',
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: verticalScale(24),
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  errorText: {
    fontSize: moderateScale(16),
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
  },
  loadingContainer: {
    width: scale(160),
    height: scale(160),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scale(8),
  },
  loadingText: {
    marginTop: verticalScale(8),
    fontSize: moderateScale(12),
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
  },
  emptyContainer: {
    width: scale(160),
    height: scale(160),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scale(8),
    padding: scale(16),
  },
  emptyText: {
    fontSize: moderateScale(14),
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
    fontWeight: '500',
    marginBottom: verticalScale(4),
  },
  emptySubtext: {
    fontSize: moderateScale(12),
    color: '#999',
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
  },
  achievementImagePlaceholder: {
    width: scale(160),
    height: scale(160),
    backgroundColor: 'rgba(249, 168, 37, 0.1)',
    borderRadius: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementEmoji: {
    fontSize: moderateScale(48),
  },
  achievementBadgeImage: {
    width: scale(60),
    height: scale(60),
  },
  journeyImagePlaceholder: {
    width: scale(160),
    height: verticalScale(90),
    backgroundColor: 'rgba(62, 71, 81, 0.1)',
    borderRadius: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  journeyImageFull: {
    width: '100%',
    height: '100%',
    borderRadius: scale(8),
  },
  journeyGradientPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(8),
  },
  journeyGradientTitle: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  journeyEmoji: {
    fontSize: moderateScale(32),
  },
});