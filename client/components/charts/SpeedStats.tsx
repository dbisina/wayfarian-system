import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SpeedStats = () => {
  return (
    <View style={styles.container}>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>Max Speed</Text>
        <Text style={styles.statValue}>120 kph</Text>
      </View>
      
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>Average Speed</Text>
        <Text style={styles.statValue}>65 kph</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    gap: 8,
  },
  statLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: '#000000',
  },
  statValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
    lineHeight: 30,
    color: '#000000',
  },
});

export default SpeedStats;
