import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Header from '../components/ui/Header';
import LeaderboardItem from '../components/ui/LeaderboardItem';

interface LeaderboardScreenProps {
  onTabPress?: (tab: string) => void;
}

const LeaderboardScreen = ({onTabPress}: LeaderboardScreenProps): JSX.Element => {
  const [activeTab, setActiveTab] = useState<'friends' | 'global'>('friends');

  const friendsData = [
    {
      id: '1',
      rank: 15,
      name: 'You',
      country: '',
      distance: '2,500 mi',
      avatar: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/QcnYtumE2N.png',
      isCurrentUser: true,
    },
  ];

  const globalData = [
    {
      id: '2',
      rank: 1,
      name: 'United States',
      country: 'United States',
      distance: '12,345 mi',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '3',
      rank: 2,
      name: 'Canada',
      country: 'Canada',
      distance: '11,876 mi',
      avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '4',
      rank: 3,
      name: 'United Kingdom',
      country: 'United Kingdom',
      distance: '10,543 mi',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '5',
      rank: 4,
      name: 'Germany',
      country: 'Germany',
      distance: '9,210 mi',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '6',
      rank: 5,
      name: 'Australia',
      country: 'Australia',
      distance: '8,765 mi',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '7',
      rank: 6,
      name: 'France',
      country: 'France',
      distance: '7,432 mi',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '8',
      rank: 7,
      name: 'Italy',
      country: 'Italy',
      distance: '6,987 mi',
      avatar: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '9',
      rank: 8,
      name: 'Spain',
      country: 'Spain',
      distance: '5,654 mi',
      avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
    {
      id: '10',
      rank: 9,
      name: 'Japan',
      country: 'Japan',
      distance: '4,321 mi',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face',
      isCurrentUser: false,
    },
  ];

  const currentData = activeTab === 'friends' ? friendsData : globalData;

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.avatar} />
        <Text style={styles.title}>Leaderboard</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
            Friends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'global' && styles.activeTab]}
          onPress={() => setActiveTab('global')}
        >
          <Text style={[styles.tabText, activeTab === 'global' && styles.activeTabText]}>
            Global
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {currentData.map((item) => (
          <LeaderboardItem
            key={item.id}
            rank={item.rank}
            name={item.name}
            country={item.country}
            distance={item.distance}
            avatar={item.avatar}
            isCurrentUser={item.isCurrentUser}
          />
        ))}
      </ScrollView>

      {/* BottomNavigation component not available in this project */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 27,
    backgroundColor: '#F6F6F6',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D9D9D9',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  settingsButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#000000',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  activeTabText: {
    color: '#000000',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
});

export default LeaderboardScreen;
