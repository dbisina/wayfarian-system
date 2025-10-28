// app/components/FloatingJourneyStatus.tsx
// Minimized journey status overlay that appears on all screens

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useJourney } from '../contexts/JourneyContext';
import { router } from 'expo-router';

export default function FloatingJourneyStatus() {
  const { isTracking, isMinimized, stats, maximizeJourney } = useJourney();

  if (!isTracking || !isMinimized) {
    return null;
  }

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
    router.push('/journey');
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        {/* Time */}
        <View style={styles.statItem}>
          <MaterialIcons name="schedule" size={14} color="#FFFFFF" />
          <Text style={styles.statText}>{formatTime(Math.floor(stats.totalTime))}</Text>
        </View>

        {/* Speed */}
        <View style={styles.statItem}>
          <MaterialIcons name="speed" size={14} color="#FFFFFF" />
          <Text style={styles.statText}>{stats.currentSpeed.toFixed(0)} km/h</Text>
        </View>

        {/* Distance */}
        <View style={styles.statItem}>
          <MaterialIcons name="straighten" size={14} color="#FFFFFF" />
          <Text style={styles.statText}>{stats.totalDistance.toFixed(1)} km</Text>
        </View>

        {/* Expand indicator */}
        <MaterialIcons name="expand-less" size={16} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 16,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
});