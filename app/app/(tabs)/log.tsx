import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RideLogScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('solo');

  const badges = [
    {
      id: '1',
      title: 'Night owl',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/My2ufzutha.png',
    },
    {
      id: '2',
      title: 'Traveller',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/5GkepzddaS.png',
    },
    {
      id: '3',
      title: '',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/PmajHDA836.png',
    },
    {
      id: '4',
      title: '',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/N7NCwakBh8.png',
    },
  ];

  const challenges = [
    {
      id: '1',
      title: 'First to Finish',
      duration: '3hrs 30 mins',
      distance: '10ml',
      status: 'In Progress',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/HfzG68QRKx.png',
    },
    {
      id: '2',
      title: 'First to Finish',
      duration: '3hrs 30 mins',
      distance: '10ml',
      status: 'In Progress',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/2AzqFqH67Z.png',
    },
    {
      id: '3',
      title: 'First to Finish',
      duration: '3hrs 30 mins',
      distance: '10ml',
      status: 'In Progress',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/3JqXwaabXQ.png',
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.explorerBadge}>Explorer</Text>
          </View>
          <Text style={styles.progressSubtitle}>The road is your XP keep going buddy!</Text>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View style={styles.progressBarFill} />
            </View>
          </View>
          <Text style={styles.nextBadgeText}>Next badge: <Text style={styles.trailblazerText}>Trailblazer</Text></Text>
        </View>
        
        {/* Badges Section */}
        <View style={styles.badgesSection}>
          <View style={styles.badgesGrid}>
            {badges.map((badge) => (
              <View key={badge.id} style={styles.badgeContainer}>
                <Image source={{uri: badge.imageUrl}} style={styles.badgeImage} />
                {badge.title ? <Text style={styles.badgeTitle}>{badge.title}</Text> : null}
              </View>
            ))}
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

        {/* Challenges Section */}
        <View style={styles.challengesSection}>
          {challenges.map((challenge) => (
            <View key={challenge.id} style={styles.challengeCard}>
              <Image source={{uri: challenge.imageUrl}} style={styles.challengeImage} />
              <View style={styles.challengeContent}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.challengeDuration}>{challenge.duration}</Text>
                <Text style={styles.challengeDistance}>{challenge.distance}</Text>
                <View style={styles.challengeProgressContainer}>
                  <View style={styles.challengeProgressBar}>
                    <View style={styles.challengeProgressFill} />
                  </View>
                  <Text style={styles.challengeStatus}>{challenge.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* View All Button */}
        <TouchableOpacity style={styles.viewAllButton}>
          <Text style={styles.viewAllText}>View all challeges</Text>
        </TouchableOpacity>
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
  scrollContent: {
    paddingBottom: 100,
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

