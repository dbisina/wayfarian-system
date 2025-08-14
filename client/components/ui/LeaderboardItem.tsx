import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
} from 'react-native';

interface LeaderboardItemProps {
  rank: string;
  country: string;
  distance: string;
  avatar: string;
  isLast?: boolean;
}

const LeaderboardItem = ({
  rank,
  country,
  distance,
  avatar,
  isLast = false,
}: LeaderboardItemProps) => {
  return (
    <View style={[styles.container, isLast && styles.lastItem]}>
      <View style={styles.leftSection}>
        <Image source={{ uri: avatar }} style={styles.avatar} />
        <View style={styles.userInfo}>
          <Text style={styles.rank}>{rank}</Text>
          <Text style={styles.country}>{country}</Text>
        </View>
      </View>
      <View style={styles.rightSection}>
        <Text style={styles.distance}>{distance}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    minHeight: 72,
  },
  lastItem: {
    marginBottom: 16,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
  },
  userInfo: {
    justifyContent: 'center',
  },
  rank: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    color: '#000000',
    marginBottom: 2,
  },
  country: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: '#214A4A',
  },
  rightSection: {
    justifyContent: 'center',
  },
  distance: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: '#000000',
  },
});

export default LeaderboardItem;
