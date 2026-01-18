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
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

interface TrackingOverlayProps {
  onStop: () => void;
  onPause?: () => void;
  onResume?: () => void;
  isPaused: boolean;
}

const splitMeasurement = (formatted: string) => {
  if (!formatted) return { value: '0', unit: '' };
  const match = formatted.match(/^\s*([-+]?\d*[.,]?\d*)\s*(.*)$/);
  if (!match) return { value: formatted, unit: '' };
  
  let unit = (match[2] || '').trim().toLowerCase();
  
  // Custom unit formatting to match design
  if (unit === 'km/h') unit = 'KPH';
  else if (unit === 'mph') unit = 'MPH';
  else if (unit === 'km') unit = 'KM';
  else if (unit === 'mi') unit = 'MI';
  else unit = unit.toUpperCase();
  
  return {
    value: match[1] || formatted,
    unit,
  };
};

export default function TrackingOverlay({ onStop, onPause, onResume, isPaused }: TrackingOverlayProps) {
  const { currentJourney } = useJourneyState();
  const stats = useJourneyStats();
  const { convertDistance, convertSpeed } = useSettings();
  const { t } = useTranslation();

  // Parse stats for display
  const distance = useMemo(() => {
    return splitMeasurement(convertDistance(stats.totalDistance));
  }, [stats.totalDistance, convertDistance]);

  const duration = useMemo(() => {
    const seconds = stats.totalTime;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [stats.totalTime]);

  const speed = useMemo(() => {
     return splitMeasurement(convertSpeed(stats.currentSpeed));
  }, [stats.currentSpeed, convertSpeed]);

  return (
    <View style={styles.container}>
      {/* Handle Bar */}
      <View style={styles.handle} />

      {/* Main Stats Row */}
      <View style={styles.statsRow}>
        
        {/* Time */}
        <View style={styles.statItem}>
          <View style={styles.valueContainer}>
             <Text style={styles.statValueBig}>{duration}</Text>
          </View>
          <Text style={styles.statLabel}>{t('components.trackingOverlay.duration')}</Text>
        </View>

        {/* Speed */}
        <View style={styles.statItem}>
          <View style={styles.valueContainer}>
            <Text style={styles.statValueBig}>{speed.value}</Text>
            <Text style={styles.statUnit}>{speed.unit}</Text>
          </View>
          <Text style={styles.statLabel}>{t('components.trackingOverlay.speed') || 'Speed'}</Text>
        </View>

        {/* Distance */}
        <View style={styles.statItem}>
          <View style={styles.valueContainer}>
            <Text style={styles.statValueBig}>{distance.value}</Text>
            <Text style={styles.statUnit}>{distance.unit}</Text>
          </View>
          <Text style={styles.statLabel}>{t('components.trackingOverlay.distance')}</Text>
        </View>

      </View>

      {/* Secondary Info (Location only now) */}
      {currentJourney?.title && (
        <View style={styles.secondaryRow}>
            <View style={styles.secondaryItem}>
                <MaterialIcons name="place" size={16} color="#6B7280" />
                <Text style={styles.secondaryText} numberOfLines={1}>
                    {currentJourney.title}
                </Text>
            </View>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {!isPaused ? (
            <TouchableOpacity style={styles.pauseButton} onPress={onPause} activeOpacity={0.8}>
                <Ionicons name="pause" size={24} color="#000000" />
            </TouchableOpacity>
        ) : (
             <TouchableOpacity style={styles.resumeButton} onPress={onResume} activeOpacity={0.8}>
                <Ionicons name="play" size={24} color="#FFFFFF" />
                <Text style={styles.resumeText}>{t('components.trackingOverlay.resume')}</Text>
            </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.stopButton} onPress={onStop} activeOpacity={0.8}>
            <View style={styles.stopIcon} />
            <Text style={styles.stopText}>{t('components.trackingOverlay.endTrip')}</Text>
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
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center', // Centered alignment as per likely design intent for balanced look
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statValueBig: {
    fontSize: 32, // Slightly smaller than 48 to fit 3 items
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Space Grotesk',
    lineHeight: 40,
  },
  statUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827', // Darker to match design image
    marginLeft: 2,
    marginTop: 0,
    fontFamily: 'Space Grotesk',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 2,
    fontFamily: 'Space Grotesk',
  },
  secondaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
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
      maxWidth: 200,
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
    backgroundColor: '#F97316', // Orange color
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
