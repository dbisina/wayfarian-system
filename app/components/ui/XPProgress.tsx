import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

const XPProgress = (): React.JSX.Element => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>XP Progress</Text>
      <Image
        source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/Uo9gChcj66.svg' }}
        style={styles.progressBar}
      />
      <Text style={styles.nextBadge}>Next Badge: Explorer</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
  },
  nextBadge: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
});

export default XPProgress;
