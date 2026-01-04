import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';
import { useJourneyState, useJourneyStats } from '../hooks/useJourneyState';

const { width } = Dimensions.get('window');

interface TrackingOverlayProps {
  onStop: () => void;
  onPause?: () => void;
  onResume?: () => void;
  isPaused: boolean;
}

export default function TrackingOverlay({ onStop, onPause, onResume, isPaused }: TrackingOverlayProps) {
  const { currentJourney } = useJourneyState();
  const stats = useJourneyStats();
  const { convertDistance, convertSpeed } = useSettings();

  // Parse stats for big display
  const distance = useMemo(() => {
    const rawArgs = convertDistance(stats.totalDistance);
    return rawArgs.replace('km', '').replace('mi', '').trim();
  }, [stats.totalDistance, convertDistance]);

  const units = useMemo(() => {
    return convertDistance(1).includes('mi') ? 'mi' : 'km';
  }, [convertDistance]);

  const duration = useMemo(() => {
    const seconds = stats.totalTime;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [stats.totalTime]);

  const speed = useMemo(() => {
     return convertSpeed(stats.currentSpeed);
  }, [stats.currentSpeed, convertSpeed]);

  return (
    <View style={styles.container}>
      {/* Handle Bar */}
      <View style={styles.handle} />

      {/* Main Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.mainStat}>
          <Text style={styles.statLabel}>Distance</Text>
          <View style={styles.valueContainer}>
            <Text style={styles.statValueBig}>{distance}</Text>
            <Text style={styles.statUnit}>{units}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.mainStat}>
          <Text style={styles.statLabel}>Duration</Text>
          <View style={styles.valueContainer}>
            <Text style={styles.statValueBig}>{duration}</Text>
          </View>
        </View>
      </View>

      {/* Secondary Stats */}
      <View style={styles.secondaryRow}>
        <View style={styles.secondaryItem}>
            <MaterialIcons name="speed" size={16} color="#6B7280" />
            <Text style={styles.secondaryText}>{speed}</Text>
        </View>
        {currentJourney?.title && (
            <View style={styles.secondaryItem}>
                <MaterialIcons name="place" size={16} color="#6B7280" />
                <Text style={styles.secondaryText} numberOfLines={1}>
                    {currentJourney.title}
                </Text>
            </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isPaused ? (
            <TouchableOpacity style={styles.pauseButton} onPress={onPause} activeOpacity={0.8}>
                <Ionicons name="pause" size={24} color="#000000" />
            </TouchableOpacity>
        ) : (
             <TouchableOpacity style={styles.resumeButton} onPress={onResume} activeOpacity={0.8}>
                <Ionicons name="play" size={24} color="#FFFFFF" />
                <Text style={styles.resumeText}>Resume</Text>
            </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.stopButton} onPress={onStop} activeOpacity={0.8}>
            <View style={styles.stopIcon} />
            <Text style={styles.stopText}>End Trip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  mainStat: {
    flex: 1,
    alignItems: 'center',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statValueBig: {
    fontSize: 48,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Space Grotesk', // Assuming font is available
    lineHeight: 56,
  },
  statUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 4,
    fontFamily: 'Space Grotesk',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 4,
    fontFamily: 'Space Grotesk',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 10,
  },
  secondaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      marginBottom: 24,
  },
  secondaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#F3F4F6',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
  },
  secondaryText: {
      fontSize: 14,
      color: '#374151',
      fontFamily: 'Space Grotesk',
      fontWeight: '500',
      maxWidth: 150,
  },
  controls: {
    flexDirection: 'row',
    gap: 16,
  },
  pauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resumeButton: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  resumeText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'Space Grotesk',
  },
  stopButton: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  stopIcon: {
      width: 14,
      height: 14,
      backgroundColor: '#FFFFFF',
      borderRadius: 2,
  },
  stopText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Space Grotesk',
  },
});
