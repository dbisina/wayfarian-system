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

const RideLogScreen = ({ onNavigate }) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleFloatingButtonPress = () => {
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };
  const badges = [
    {
      id: 1,
      image: require('../assets/images/2025-10-15/AEeTdwjuFZ.png'),
    },
    {
      id: 2,
      image: require('../assets/images/2025-10-15/v11EVR3baW.png'),
    },
    {
      id: 3,
      image: require('../assets/images/2025-10-15/zKQt6dXJzc.png'),
    },
    {
      id: 4,
      image: require('../assets/images/2025-10-15/mKmMoNcohn.png'),
    },
  ];

  const challenges = [
    {
      id: 1,
      title: 'First to Finish',
      duration: '3hrs 30 mins',
      distance: '10ml',
      progress: 0.36,
      image: require('../assets/images/2025-10-15/gmEkLn9yyy.png'),
    },
    {
      id: 2,
      title: 'First to Finish',
      duration: '3hrs 30 mins',
      distance: '10ml',
      progress: 0.36,
      image: require('../assets/images/2025-10-15/gmEkLn9yyy.png'),
    },
    {
      id: 3,
      title: 'First to Finish',
      duration: '3hrs 30 mins',
      distance: '10ml',
      progress: 0.36,
      image: require('../assets/images/2025-10-15/gmEkLn9yyy.png'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../assets/images/2025-10-15/EXDyvAcMBj.png')}
            style={styles.profileImage}
          />
          <Text style={styles.headerTitle}>Ride Log</Text>
          <Image
            source={require('../assets/images/2025-10-15/B2xH55qhEF.png')}
            style={styles.notificationIcon}
          />
        </View>

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <Text style={styles.progressTitle}>Progess</Text>
          <Text style={styles.progressSubtitle}>The road is your XP keep going buddy!</Text>
          
          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View style={styles.progressBarFill} />
            </View>
          </View>
          
          <View style={styles.progressInfo}>
            <Text style={styles.currentBadge}>Explorer</Text>
            <Text style={styles.nextBadge}>Next badge: Trailblazer</Text>
          </View>
        </View>

        {/* Badges Section */}
        <View style={styles.badgesSection}>
          <Text style={styles.sectionTitle}>Badges earned</Text>
          <View style={styles.badgesContainer}>
            {badges.map((badge) => (
              <Image
                key={badge.id}
                source={{ uri: badge.image }}
                style={styles.badgeImage}
              />
            ))}
          </View>
          <View style={styles.badgeLabels}>
            <Text style={styles.badgeLabel}>Night owl</Text>
            <Text style={styles.badgeLabel}>Traveller</Text>
          </View>
        </View>

        {/* Categories Section */}
        <View style={styles.categoriesSection}>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryLabel}>Solo rides</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryLabel}>Group rides</Text>
          </View>
          <View style={styles.categoryItem}>
            <Text style={styles.categoryLabel}>My challenges</Text>
          </View>
        </View>

        {/* Challenges List */}
        <View style={styles.challengesList}>
          {challenges.map((challenge) => (
            <View key={challenge.id} style={styles.challengeItem}>
              <Image
                source={{ uri: challenge.image }}
                style={styles.challengeImage}
              />
              <View style={styles.challengeInfo}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.challengeDuration}>{challenge.duration}</Text>
                <Text style={styles.challengeDistance}>{challenge.distance}</Text>
                
                {/* Progress Bar */}
                <View style={styles.challengeProgressContainer}>
                  <View style={styles.challengeProgressBackground}>
                    <View 
                      style={[
                        styles.challengeProgressFill, 
                        { width: `${challenge.progress * 100}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressStatus}>In Progress</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => onNavigate('home')}
        >
          <Image
            source={require('../assets/images/2025-10-15/y2W4CRNORb.png')}
            style={styles.navIcon}
          />
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

        <TouchableOpacity style={styles.navItemActive}>
          <Image
            source={require('../assets/images/2025-10-15/tQcweNppVu.png')}
            style={styles.navIcon}
          />
          <Text style={styles.navText}>Log</Text>
        </TouchableOpacity>
      </View>

      <ActivityModal 
        visible={modalVisible} 
        onClose={handleCloseModal} 
      />
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Space Grotesk',
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 23,
    marginRight: 34,
  },
  notificationIcon: {
    width: 34,
    height: 34,
  },
  progressSection: {
    backgroundColor: '#F9A825',
    marginHorizontal: 15,
    marginTop: 25,
    borderRadius: 10,
    padding: 18,
    paddingBottom: 25,
  },
  progressTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 22,
    marginBottom: 5,
  },
  progressSubtitle: {
    fontSize: 12,
    color: '#000000',
    lineHeight: 20,
    marginBottom: 25,
  },
  progressBarContainer: {
    marginBottom: 20,
  },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  progressBarFill: {
    width: '64%',
    height: 4,
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 17,
  },
  nextBadge: {
    fontSize: 10,
    color: '#000000',
    lineHeight: 18,
  },
  badgesSection: {
    paddingHorizontal: 16,
    paddingTop: 25,
  },
  sectionTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 22,
    marginBottom: 20,
  },
  badgesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 75,
    marginBottom: 15,
  },
  badgeImage: {
    width: 60,
    height: 60,
  },
  badgeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  badgeLabel: {
    fontSize: 10,
    color: '#000000',
    textAlign: 'center',
  },
  categoriesSection: {
    backgroundColor: '#F9A825',
    marginHorizontal: 14,
    marginTop: 25,
    borderRadius: 20,
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 19,
    justifyContent: 'space-between',
  },
  categoryItem: {
    alignItems: 'center',
  },
  categoryLabel: {
    fontFamily: 'Space Grotesk',
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
    lineHeight: 17,
  },
  challengesList: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 20,
  },
  challengeItem: {
    flexDirection: 'row',
    gap: 16,
  },
  challengeImage: {
    width: 165,
    height: 80,
    borderRadius: 5,
  },
  challengeInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  challengeTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 22,
  },
  challengeDuration: {
    fontSize: 10,
    color: '#000000',
    lineHeight: 10,
  },
  challengeDistance: {
    fontSize: 10,
    color: '#000000',
    lineHeight: 10,
  },
  challengeProgressContainer: {
    gap: 4,
  },
  challengeProgressBackground: {
    width: '100%',
    height: 2,
    backgroundColor: '#D9D9D9',
    borderRadius: 5,
  },
  challengeProgressFill: {
    height: 2,
    backgroundColor: '#F9A825',
    borderRadius: 5,
  },
  progressStatus: {
    fontSize: 5,
    color: '#000000',
    alignSelf: 'flex-end',
  },
  bottomNavigation: {
    position: 'absolute',
    bottom: 29,
    left: 20,
    right: 20,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 31,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 7,
    gap: 6,
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
    fontSize: 12,
    color: '#000000',
    lineHeight: 18,
  },
  floatingButtonContainer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -17.5,
    top: -7.5,
  },
  floatingButton: {
    width: 35,
    height: 35,
    backgroundColor: '#FFFFFF',
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingIcon: {
    width: 35,
    height: 35,
  },
});

export default RideLogScreen;
