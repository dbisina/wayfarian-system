// app/components/FloatingJourneyStatus.tsx
// Dynamic Island style journey status pill — metrics only (time, distance, speed)

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useJourney } from '../contexts/JourneyContext';
import { useSettings } from '../contexts/SettingsContext';
import { router } from 'expo-router';
import { useJourneyState, useJourneyStats } from '../hooks/useJourneyState';

export default function FloatingJourneyStatus({ homeOnly = false }: { homeOnly?: boolean }) {
  const { maximizeJourney } = useJourney();
  const { isTracking, isMinimized, currentJourney, hydrated } = useJourneyState();
  const stats = useJourneyStats();
  const { convertDistance, convertSpeed } = useSettings();

  // Pulse animation for 'Live' indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isTracking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
      };
    } else {
      pulseAnim.setValue(1);
    }
  }, [isTracking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't show for completed journeys or when no journey exists
  const isActive = currentJourney && currentJourney.status !== 'completed';
  const shouldShow = homeOnly
    ? (hydrated && isActive)
    : (hydrated && isMinimized && isActive && (isTracking || currentJourney.status === 'paused'));
  if (!shouldShow) return null;

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handlePress = () => {
    maximizeJourney();
    if (currentJourney?.groupJourneyId) {
      router.push({ pathname: '/journey', params: { groupJourneyId: currentJourney.groupJourneyId } });
    } else if (currentJourney?.groupId) {
      router.push({ pathname: '/journey', params: { groupId: currentJourney.groupId } });
    } else {
      router.push('/journey');
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.9}>
      <View style={styles.island}>
        {/* Live Indicator */}
        <View style={styles.indicatorContainer}>
          {isTracking ? (
            <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          ) : (
            <MaterialIcons name="pause" size={14} color="#F59E0B" />
          )}
        </View>

        {/* Stats: Time | Distance | Speed */}
        <View style={styles.content}>
          <Text style={styles.timeText}>{formatTime(Math.floor(stats.totalTime))}</Text>

          <View style={styles.divider} />

          <Text style={styles.statText}>{convertDistance(stats.totalDistance)}</Text>

          <View style={styles.divider} />

          <Text style={styles.statText}>{convertSpeed(stats.currentSpeed)}</Text>
        </View>

        {/* Expand Icon */}
        <MaterialIcons name="keyboard-arrow-up" size={20} color="#6B7280" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 110,
    left: 0,
    right: 0,
    zIndex: 2000,
    alignItems: 'center',
  },
  island: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 32,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    gap: 12,
  },
  indicatorContainer: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  timeText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontVariant: ['tabular-nums'],
  },
  statText: {
    fontSize: 14,
    color: '#D1D5DB',
    fontWeight: '600',
    fontFamily: 'Space Grotesk',
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: '#374151',
  },
});
