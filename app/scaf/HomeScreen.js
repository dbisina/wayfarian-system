import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import ActivityModal from './ActivityModal';

const HomeScreen = ({ onNavigate }) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleFloatingButtonPress = () => {
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Background Image */}
        <View style={styles.backgroundImageContainer}>
          <Image
            source={require('../assets/images/2025-09-26/pvtm78LBD6.png')}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../assets/images/2025-09-26/MN0Tj1LcZr.png')}
            style={styles.profileImage}
          />
          <Text style={styles.logo}>LOGO</Text>
          <View style={styles.notificationContainer}>
            <Image
              source={require('../assets/images/2025-09-26/dcUiUAEFXH.png')}
              style={styles.notificationIcon}
            />
          </View>
        </View>

        {/* User Profile Section */}
        <View style={styles.profileSection}>
          <Image
            source={require('../assets/images/2025-09-26/i2yG8AHX5c.png')}
            style={styles.userAvatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>Alex Ryder</Text>
            <Text style={styles.userRank}>Explorer Rank</Text>
            <Text style={styles.userStats}>1,234 mi | 24h 30m | 3 Badges</Text>
          </View>
        </View>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Distance Covered</Text>
              <Text style={styles.statValue}>1,234Kms</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Time Traveled</Text>
              <Text style={styles.statValue}>24h 30m</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg. Speed</Text>
              <Text style={styles.statValue}>55 km/hr</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Max Speed</Text>
              <Text style={styles.statValue}>120 km/hr</Text>
            </View>
          </View>
        </View>

        {/* XP Progress Section */}
        <View style={styles.xpSection}>
          <Text style={styles.xpTitle}>XP Progress</Text>
          <View style={styles.progressBarContainer}>
            <Image
              source={require('../assets/images/2025-09-26/pyH5pJcAte.png')}
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
            <View style={styles.achievementCard}>
              <Image
                source={require('../assets/images/2025-09-26/HD67ooi8mi.png')}
                style={styles.achievementImage}
              />
              <View style={styles.achievementInfo}>
                <Text style={styles.achievementTitle}>First Trip</Text>
                <Text style={styles.achievementDescription}>Completed your first journey</Text>
              </View>
            </View>
            <View style={styles.achievementCard}>
              <Image
                source={require('../assets/images/2025-09-26/nnx5Ci3RSL.png')}
                style={styles.achievementImage}
              />
              <View style={styles.achievementInfo}>
                <Text style={styles.achievementTitle}>Speed Demon</Text>
                <Text style={styles.achievementDescription}>Reached 100 mph</Text>
              </View>
            </View>
            <View style={styles.achievementCard}>
              <Image
                source={require('../assets/images/2025-09-26/DhOvD6RmG6.png')}
                style={styles.achievementImage}
              />
              <View style={styles.achievementInfo}>
                <Text style={styles.achievementTitle}>Longest Drive</Text>
                <Text style={styles.achievementDescription}>Drove over 500 miles</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Past Journeys Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Past Journeys</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.journeysScroll}>
          <View style={styles.journeysContainer}>
            <View style={styles.journeyCard}>
              <Image
                source={require('../assets/images/2025-09-26/gmFMEnG4Kf.png')}
                style={styles.journeyImage}
              />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyTitle}>Mountain Pass Adventure</Text>
                <Text style={styles.journeyStats}>250 mi | 5h 15m</Text>
              </View>
            </View>
            <View style={styles.journeyCard}>
              <Image
                source={require('../assets/images/2025-09-26/meDu0nZOE8.png')}
                style={styles.journeyImage}
              />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyTitle}>Night City Cruise</Text>
                <Text style={styles.journeyStats}>180 mi | 3h 45m</Text>
              </View>
            </View>
            <View style={styles.journeyCard}>
              <Image
                source={require('../assets/images/2025-09-26/xWo3Tmd2Sk.png')}
                style={styles.journeyImage}
              />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyTitle}>Coastal Escape</Text>
                <Text style={styles.journeyStats}>320 mi | 6h 30m</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Start Journey Button */}
        <View style={styles.startJourneyContainer}>
          <TouchableOpacity style={styles.startJourneyButton}>
            <Image
              source={require('../assets/images/2025-09-26/PdS2AJiDCo.png')}
              style={styles.startJourneyIcon}
            />
            <Text style={styles.startJourneyText}>Start Journey</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Navigation */}
        <View style={styles.bottomNavigation}>
          <TouchableOpacity style={styles.navItemActive}>
            <Image
              source={require('../assets/images/2025-10-15/y2W4CRNORb.png')}
              style={styles.navIcon}
            />
            <Text style={styles.navText}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem}>
            <Image
              source={require('../assets/images/2025-10-15/1bd3DwwpQG.png')}
              style={styles.navIcon}
            />
          </TouchableOpacity>

          {/* Floating Center Button */}
          <View style={styles.floatingButtonContainer}>
            <TouchableOpacity 
              style={styles.floatingButton}
              onPress={handleFloatingButtonPress}
            >
              <Image
                source={require('../assets/images/2025-10-15/sZMbhKBvpn.png')}
                style={styles.floatingIcon}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.navItem}>
            <Image
              source={require('../assets/images/2025-10-15/g0HQMrSGro.png')}
              style={styles.navIcon}
            />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem}
            onPress={() => onNavigate('ridelog')}
          >
            <Image
              source={require('../assets/images/2025-10-15/tQcweNppVu.png')}
              style={styles.navIcon}
            />
          </TouchableOpacity>
        </View>

        <ActivityModal 
          visible={modalVisible} 
          onClose={handleCloseModal} 
        />
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
  bottomNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    marginHorizontal: 22,
    marginBottom: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 33,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2.2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  navIcon: {
    width: 24,
    height: 24,
  },
  navText: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
    lineHeight: 18,
  },
});

export default HomeScreen;
