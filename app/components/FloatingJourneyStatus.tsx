// app/components/FloatingJourneyStatus.tsx
// Dynamic Island style journey status pill with progress bar and addresses

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useJourney } from '../contexts/JourneyContext';
import { useSettings } from '../contexts/SettingsContext';
import { router } from 'expo-router';
import { useJourneyState, useJourneyStats } from '../hooks/useJourneyState';


// Format address for two-line display
function formatAddress(address?: string, maxLen = 35): string {
  if (!address) return '';
  const cleaned = address
    .replace(/,?\s*\d{5,}.*$/, '')
    .replace(/,?\s*[A-Z]{2,3}\s*$/, '')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  const parts = cleaned.split(',');
  // Return first two parts for two lines
  return parts.slice(0, 2).map(p => p.trim()).join('\n') || cleaned.substring(0, maxLen - 1) + '…';
}

export default function FloatingJourneyStatus({ homeOnly = false }: { homeOnly?: boolean }) {
  const { maximizeJourney } = useJourney();
  const { isTracking, isMinimized, currentJourney, hydrated } = useJourneyState();
  const stats = useJourneyStats();
  const { convertDistance, convertSpeed } = useSettings();
  
  // Pulse animation for 'Live' indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Smooth progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isTracking) {
      Animated.loop(
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
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isTracking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate progress towards destination
  const progress = useMemo(() => {
    if (!currentJourney?.endLocation || !currentJourney?.startLocation) return 0;
    if (stats.totalDistance <= 0) return 0;
    
    // Haversine distance from start to end
    const R = 6371;
    const startLat = currentJourney.startLocation.latitude;
    const startLng = currentJourney.startLocation.longitude;
    const endLat = currentJourney.endLocation.latitude;
    const endLng = currentJourney.endLocation.longitude;
    const dLat = (endLat - startLat) * Math.PI / 180;
    const dLon = (endLng - startLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(startLat * Math.PI / 180) *
      Math.cos(endLat * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    const totalStraightLine = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    if (totalStraightLine <= 0) return 0;
    // Use ratio of traveled distance to estimated total (traveled + remaining ~ total)
    return Math.min(stats.totalDistance / (totalStraightLine * 1.3), 0.99); // 1.3x factor for road vs straight line
  }, [currentJourney, stats.totalDistance]);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const shouldShow = homeOnly
    ? (hydrated && !!currentJourney)
    : (hydrated && isMinimized && (isTracking || (currentJourney && currentJourney.status === 'paused')));
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

  const startAddr = formatAddress(currentJourney?.startLocation?.address);
  const endAddr = formatAddress(currentJourney?.endLocation?.address);
  const hasAddresses = !!(startAddr || endAddr);

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.9}>
      <View style={styles.island}>
        {/* Top row: Live indicator + Stats */}
        <View style={styles.topRow}>
          {/* Live Indicator */}
          <View style={styles.indicatorContainer}>
            {isTracking ? (
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
            ) : (
              <MaterialIcons name="pause" size={14} color="#F59E0B" />
            )}
          </View>

          {/* Stats Content */}
          <View style={styles.content}>
            <Text style={styles.timeText}>{formatTime(Math.floor(stats.totalTime))}</Text>
            
            <View style={styles.divider} />
            
            <Text style={styles.statText}>{convertDistance(stats.totalDistance)}</Text>
            
            <View style={styles.divider} />
            
            <Text style={styles.statText}>{convertSpeed(stats.currentSpeed)}</Text>
          </View>

          {/* Expand Icon */}
          <MaterialIcons name="keyboard-arrow-down" size={20} color="#6B7280" />
        </View>

        {/* Progress bar with addresses */}
        {hasAddresses && (
          <View style={styles.progressSection}>
            {/* Two-line address labels with icons */}
            <View style={styles.addressRow}>
              <View style={styles.addressBlock}>
                <View style={styles.addressDot} />
                <Text style={styles.addressText} numberOfLines={2}>
                  {startAddr || 'Start'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={12} color="#6B7280" />
              <View style={[styles.addressBlock, { alignItems: 'flex-end' }]}>
                <Ionicons name="location" size={10} color="#F97316" />
                <Text style={[styles.addressText, { textAlign: 'right' }]} numberOfLines={2}>
                  {endAddr || 'Destination'}
                </Text>
              </View>
            </View>
            
            {/* Progress bar with car icon */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBg}>
                <Animated.View
                  style={[
                    styles.progressBarFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
              {/* Start dot */}
              <View style={styles.startDot} />
              {/* Car icon at current position */}
              <Animated.View
                style={[
                  styles.carIcon,
                  {
                    left: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              >
                <Ionicons name="car" size={16} color="#F97316" />
              </Animated.View>
              {/* End marker */}
              <View style={styles.endMarker}>
                <Ionicons name="flag" size={10} color="#F97316" />
              </View>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 42 : 54,
    left: 16,
    right: 16,
    zIndex: 2000,
    alignItems: 'center',
  },
  island: {
    backgroundColor: '#000000',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 15,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  progressSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  addressBlock: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
  },
  addressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  addressText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
    lineHeight: 13,
    fontFamily: 'Space Grotesk',
  },
  progressBarContainer: {
    height: 20,
    position: 'relative',
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F97316',
    borderRadius: 3,
  },
  startDot: {
    position: 'absolute',
    left: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    top: 6,
  },
  carIcon: {
    position: 'absolute',
    marginLeft: -8,
    top: 1,
  },
  endMarker: {
    position: 'absolute',
    right: 0,
    top: 4,
  },
});