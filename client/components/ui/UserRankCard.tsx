import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
} from 'react-native';

const UserRankCard = () => {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.leftSection}>
          <Image
            source={{
              uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/2YooRCDzoE.png',
            }}
            style={styles.avatar}
          />
          <View style={styles.userInfo}>
            <Text style={styles.rank}>15</Text>
            <Text style={styles.username}>You</Text>
          </View>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.distance}>2,500 mi</Text>
        </View>
      </View>
      <View style={styles.bottomIndicator} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#FFFFBF',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    minHeight: 72,
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
    color: '#214A4A',
    marginBottom: 2,
  },
  username: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: '#8CCFCF',
  },
  rightSection: {
    justifyContent: 'center',
  },
  distance: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: '#214A4A',
  },
  bottomIndicator: {
    height: 20,
    backgroundColor: 'transparent',
  },
});

export default UserRankCard;
