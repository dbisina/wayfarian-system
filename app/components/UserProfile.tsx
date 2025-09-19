import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

const UserProfile = (): React.ReactElement => {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/QcnYtumE2N.png' }}
        style={styles.profileImage}
      />
      <View style={styles.profileInfo}>
        <Text style={styles.name}>Alex Ryder</Text>
        <Text style={styles.rank}>Explorer Rank</Text>
        <Text style={styles.stats}>1,234 mi | 24h 30m | 3 Badges</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  profileImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 28,
    marginBottom: 4,
  },
  rank: {
    fontSize: 16,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginBottom: 4,
  },
  stats: {
    fontSize: 16,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
});

export default UserProfile;
