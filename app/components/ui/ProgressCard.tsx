import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

const ProgressCard = (): React.JSX.Element => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.badge}>Explorer</Text>
      </View>
      <Text style={styles.subtitle}>The road is your XP. Keep going buddy!</Text>
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>
      <Text style={styles.nextBadge}>Next badge: Trailblazer</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FF9500',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  badge: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#000000',
    borderRadius: 4,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    width: '75%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  nextBadge: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    textAlign: 'right',
  },
});

export default ProgressCard;
