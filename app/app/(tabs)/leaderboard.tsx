import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Platform,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { router } from 'expo-router';
import { SkeletonCircle, SkeletonLine } from '../../components/Skeleton';
import { getCountryByCode } from '../../constants/countries';

// const { width: screenWidth } = Dimensions.get('window');

export default function LeaderboardScreen(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const { friendsData, globalData, loading, error, refreshLeaderboard } = useLeaderboard();
  const { convertDistance, convertSpeed } = useSettings();
  const [activeTab, setActiveTab] = useState<'friends' | 'global'>('friends');
  const [sortBy] = useState<'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime'>('totalDistance');

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

  const getDisplayValue = (user: any) => {
    switch (sortBy) {
      case 'totalDistance':
        return convertDistance(normalizeDistance(user.totalDistance || 0));
      case 'totalTime':
        return formatTime(user.totalTime || 0);
      case 'topSpeed':
        return convertSpeed(user.topSpeed || 0);
      case 'totalTrips':
        return `${user.totalTrips || 0} trips`;
      default:
        return convertDistance(normalizeDistance(user.totalDistance || 0));
    }
  };

  const onRefresh = async () => {
    await refreshLeaderboard(activeTab, sortBy);
  };

  const currentData = activeTab === 'friends' ? friendsData : globalData;

  const renderLeaderboardItem = (item: any, isCurrentUser = false) => {
    // Use photoURL if available, otherwise generate avatar with user's initials
    const displayName = item.displayName || item.name || 'User';
    const avatarUri = item.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=128&background=F9A825&color=fff&bold=true&rounded=true`;
    
    return (
      <View key={item.id || 'current-user'} style={styles.leaderboardItem}>
        <Image 
          source={{ uri: avatarUri }} 
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, isCurrentUser && styles.currentUserName]}>
            {displayName}
            {isCurrentUser && ' (You)'}
          </Text>
          <View style={styles.countryContainer}>
            {item.countryCode ? (
              <>
                {(() => {
                  const country = getCountryByCode(item.countryCode);
                  return country ? <Image source={country.flag} style={styles.flagIcon} /> : null;
                })()}
                <Text style={styles.countryText}>{item.country || 'Unknown'}</Text>
              </>
            ) : (
              <Text style={styles.countryText}>Unknown</Text>
            )}
          </View>
        </View>
        <Text style={styles.rank}>#{item.rank || item.position || 'N/A'}</Text>
        <Text style={styles.distance}>{getDisplayValue(item)}</Text>
      </View>
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Please log in to view leaderboard</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/2025-09-26/Q6avvC9L6S.png')}
          style={styles.backButton}
        />
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7}>
          <Image
            source={require('../../assets/images/2025-09-26/itjep5JQ04.png')}
            style={styles.profileIcon}
          />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <View style={styles.tabSelector}>
          <TouchableOpacity 
            style={activeTab === 'friends' ? styles.activeTab : styles.inactiveTab}
            onPress={() => {
              setActiveTab('friends');
              refreshLeaderboard('friends', sortBy);
            }}
          >
            <Text style={activeTab === 'friends' ? styles.activeTabText : styles.inactiveTabText}>
              Friends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={activeTab === 'global' ? styles.activeTab : styles.inactiveTab}
            onPress={() => {
              setActiveTab('global');
              refreshLeaderboard('global', sortBy);
            }}
          >
            <Text style={activeTab === 'global' ? styles.activeTabText : styles.inactiveTabText}>
              Global
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
      >
        {loading && !currentData ? (
          <>
            {/* Current user skeleton */}
            <View style={styles.leaderboardItem}>
              <SkeletonCircle size={56} />
              <View style={[styles.userInfo, { marginLeft: 16 }]}>
                <SkeletonLine width={140} height={14} style={{ marginBottom: 6 }} />
                <SkeletonLine width={80} height={10} />
              </View>
              <SkeletonLine width={40} height={14} style={{ marginRight: 16 }} />
              <SkeletonLine width={60} height={14} />
            </View>
            {/* List skeletons */}
            {Array.from({ length: 5 }).map((_, idx) => (
              <View key={idx} style={styles.leaderboardItem}>
                <SkeletonCircle size={56} />
                <View style={[styles.userInfo, { marginLeft: 16 }]}>
                  <SkeletonLine width={120} height={14} style={{ marginBottom: 6 }} />
                  <SkeletonLine width={70} height={10} />
                </View>
                <SkeletonLine width={30} height={14} style={{ marginRight: 16 }} />
                <SkeletonLine width={50} height={14} />
              </View>
            ))}
          </>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : currentData ? (
          <>
            {/* Current User */}
            {currentData.currentUser && renderLeaderboardItem(currentData.currentUser, true)}

            {/* Top Section */}
            <Text style={styles.sectionTitle}>
              {activeTab === 'friends' ? 'Friends Leaderboard' : 'Global Leaderboard'}
            </Text>

            {/* Leaderboard List */}
            {currentData.users && currentData.users.length > 0 ? (
              currentData.users.map((item) => renderLeaderboardItem(item))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {activeTab === 'friends' 
                    ? 'No friends to compare with yet' 
                    : 'No global data available'
                  }
                </Text>
                <Text style={styles.emptySubtext}>
                  {activeTab === 'friends' 
                    ? 'Join groups to see friends on the leaderboard' 
                    : 'Be the first to appear on the global leaderboard!'
                  }
                </Text>
              </View>
            )}
          </>
        ) : null}

        <View style={{ height: 120 }} />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 27 : 40,
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
    width: 20,
    height: 15,
    marginRight: 6,
    resizeMode: 'contain',
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
    fontFamily: 'Poppins',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Poppins',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#F9A825',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'Poppins',
    fontWeight: '500',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontFamily: 'Poppins',
  },
});


