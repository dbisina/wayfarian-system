import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

interface LeaderboardItemProps {
  rank: number;
  name: string;
  country: string;
  distance: string;
  avatar: string;
  isCurrentUser?: boolean;
}

const LeaderboardItem = ({
  rank,
  name,
  country,
  distance,
  avatar,
  isCurrentUser = false,
}: LeaderboardItemProps): React.JSX.Element => {
  return (
    <View style={[styles.container, isCurrentUser && styles.currentUserContainer]}>
      <View style={styles.leftSection}>
        <Image 
          source={{ uri: avatar }} 
          style={styles.avatar}
          onError={(error) => console.log('Avatar load error:', error)}
          defaultSource={require('../../assets/placeholder-avatar.jpg')}
        />
        <View style={styles.userInfo}>
          <Text style={styles.rank}>{rank}</Text>
          <Text style={[styles.name, isCurrentUser && styles.currentUserName]}>
            {name}
          </Text>
          {country && !isCurrentUser && (
            <Text style={styles.country}>{country}</Text>
          )}
        </View>
      </View>
      <Text style={styles.distance}>{distance}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  currentUserContainer: {
    backgroundColor: 'rgba(0, 150, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  rank: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 2,
  },
  currentUserName: {
    color: '#0096FF',
    fontWeight: '500',
  },
  country: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  distance: {
    fontSize: 16,
    fontWeight: '500',
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
});

export default LeaderboardItem;
