import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

const LeaderboardScreen = () => {
  const leaderboardData = [
    {
      id: 1,
      name: 'Liam',
      rank: '#1',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/9sr6fxuLqr.png',
      country: 'India',
      flag: 'https://static.codia.ai/image/2025-09-26/k0CyvvQ1Vs.png',
    },
    {
      id: 2,
      name: 'Sophia',
      rank: '#2',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/fQqBEh92h7.png',
      country: 'Mauritius',
      flag: 'https://static.codia.ai/image/2025-09-26/Mroy0Gqnga.png',
    },
    {
      id: 3,
      name: 'Sophia',
      rank: '#3',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/w8LpZe44ym.png',
      country: 'Australia',
      flag: 'https://static.codia.ai/image/2025-09-26/x1qUw3pAsF.png',
    },
    {
      id: 4,
      name: 'Sophia',
      rank: '#4',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/v49LekqRWs.png',
      country: 'Canada',
      flag: 'https://static.codia.ai/image/2025-09-26/yDYjL514aX.png',
    },
    {
      id: 5,
      name: 'Sophia',
      rank: '#5',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/2bmDad7KAE.png',
      country: 'Brazil',
      flag: 'https://static.codia.ai/image/2025-09-26/CWH17MJKyF.png',
    },
    {
      id: 6,
      name: 'Sophia',
      rank: '#6',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/m9UhuhxJsK.png',
      country: 'Germany',
      flag: 'https://static.codia.ai/image/2025-09-26/d26NtUQwX0.png',
    },
    {
      id: 7,
      name: 'Sophia',
      rank: '#7',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/Ue9FddReDS.png',
      country: 'France',
      flag: 'https://static.codia.ai/image/2025-09-26/6K47N6J3vC.png',
    },
    {
      id: 8,
      name: 'Sophia',
      rank: '#8',
      distance: '2,500 mi',
      avatar: 'https://static.codia.ai/image/2025-09-26/n7hA8e1NzV.png',
      country: 'Spain',
      flag: 'https://static.codia.ai/image/2025-09-26/hWE1huosya.png',
    },
  ];

  const currentUser = {
    name: 'Me',
    rank: '#12',
    distance: '2,500 mi',
    avatar: 'https://static.codia.ai/image/2025-09-26/ooehuePN8n.png',
    country: 'USA',
    flag: 'https://static.codia.ai/image/2025-09-26/d4X25iE9Gs.png',
  };

  const renderLeaderboardItem = (item, isCurrentUser = false) => (
    <View key={item.id || 'current-user'} style={styles.leaderboardItem}>
      <Image source={{ uri: item.avatar }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <Text style={[styles.userName, isCurrentUser && styles.currentUserName]}>
          {item.name}
        </Text>
        <View style={styles.countryContainer}>
          <Image source={{ uri: item.flag }} style={styles.flagIcon} />
          <Text style={styles.countryText}>{item.country}</Text>
        </View>
      </View>
      <Text style={styles.rank}>{item.rank}</Text>
      <Text style={styles.distance}>{item.distance}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/Q6avvC9L6S.png' }}
          style={styles.backButton}
        />
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/itjep5JQ04.png' }}
          style={styles.profileIcon}
        />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <View style={styles.tabSelector}>
          <TouchableOpacity style={styles.activeTab}>
            <Text style={styles.activeTabText}>Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inactiveTab}>
            <Text style={styles.inactiveTabText}>Global</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Current User */}
        {renderLeaderboardItem(currentUser, true)}

        {/* Top 20 Section */}
        <Text style={styles.sectionTitle}>Top 20</Text>

        {/* Leaderboard List */}
        {leaderboardData.map((item) => renderLeaderboardItem(item))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/Rxex08cWhr.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/V7B7QdBE9q.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/9ACTu7ObcW.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItemActive}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/1b5sa0F5G2.png' }}
            style={styles.navIcon}
          />
          <Text style={styles.navLabel}>Leaderboard</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/cmCgrNLV5K.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 27,
    paddingBottom: 11,
  },
  backButton: {
    width: 34,
    height: 34,
  },
  headerTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    color: '#000000',
    flex: 1,
    textAlign: 'center',
    marginRight: 34,
  },
  profileIcon: {
    width: 34,
    height: 34,
  },
  tabContainer: {
    paddingHorizontal: 27,
    paddingVertical: 16,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#D9D9D9',
    borderRadius: 10,
    height: 36,
    position: 'relative',
  },
  activeTab: {
    flex: 1,
    backgroundColor: '#F9A825',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveTab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTabText: {
    fontFamily: 'Poppins',
    fontSize: 14,
    lineHeight: 21,
    color: '#000000',
    fontWeight: '400',
  },
  inactiveTabText: {
    fontFamily: 'Poppins',
    fontSize: 14,
    lineHeight: 21,
    color: '#000000',
    fontWeight: '400',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
  },
  userName: {
    fontFamily: 'Poppins',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    fontWeight: '400',
    marginBottom: 4,
  },
  currentUserName: {
    opacity: 0.6,
  },
  countryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagIcon: {
    width: 11,
    height: 8,
    marginRight: 3,
  },
  countryText: {
    fontFamily: 'Poppins',
    fontSize: 8,
    lineHeight: 12,
    color: '#000000',
  },
  rank: {
    fontFamily: 'Poppins',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    fontWeight: '500',
    marginRight: 16,
    minWidth: 30,
  },
  distance: {
    fontFamily: 'Poppins',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    fontWeight: '400',
    minWidth: 60,
    textAlign: 'right',
  },
  sectionTitle: {
    fontFamily: 'Poppins',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  bottomNavigation: {
    position: 'absolute',
    bottom: 22,
    left: 22,
    right: 22,
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  navItemActive: {
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 9,
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
  navLabel: {
    fontFamily: 'Poppins',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    marginLeft: 7,
  },
});

export default LeaderboardScreen;
