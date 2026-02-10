import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userAPI } from '../../services/api';

interface Props {
  xp?: number;
  level?: number;
  compact?: boolean;
}

const LEVEL_THRESHOLDS = [
  0, 100, 400, 900, 1600, 2500, 3600, 4900, 6400, 8100,
  10000, 12100, 14400, 16900, 19600, 22500, 25600, 28900, 32400, 36100,
  40000, 44100, 48400, 52900, 57600, 62500, 67600, 72900, 78400, 84100,
  90000, 96100, 102400, 108900, 115600, 122500, 129600, 136900, 144400, 152100,
  160000, 168100, 176400, 184900, 193600, 202500, 211600, 220900, 230400, 240100,
];

const getLevelProgress = (xp: number, level: number) => {
  const currentLevelXP = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextLevelXP = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const xpInLevel = xp - currentLevelXP;
  const xpRequired = nextLevelXP - currentLevelXP;
  const percentage = xpRequired > 0 ? Math.min(100, (xpInLevel / xpRequired) * 100) : 100;
  return { xpInLevel, xpRequired, percentage };
};

const XPProgress = ({ xp = 0, level = 1, compact = false }: Props): React.JSX.Element => {
  const [streak, setStreak] = useState({ currentStreak: 0, isActive: false });

  useEffect(() => {
    userAPI.getStreak().then((res) => {
      if (res?.streak) setStreak(res.streak);
    }).catch(() => {});
  }, []);

  const { xpInLevel, xpRequired, percentage } = getLevelProgress(xp, level);

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <View style={styles.compactLevel}>
          <Text style={styles.compactLevelText}>Lv {level}</Text>
        </View>
        <View style={styles.compactBarBg}>
          <View style={[styles.compactBarFill, { width: `${percentage}%` }]} />
        </View>
        {streak.currentStreak > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={14} color="#FF9800" />
            <Text style={styles.streakBadgeText}>{streak.currentStreak}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>Level {level}</Text>
        </View>
        <Text style={styles.xpText}>
          {xp.toLocaleString()} XP
        </Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
      </View>
      <View style={styles.footerRow}>
        <Text style={styles.progressText}>
          {Math.round(xpInLevel)} / {xpRequired} XP to Level {level + 1}
        </Text>
        {streak.currentStreak > 0 && (
          <View style={styles.streakRow}>
            <Ionicons
              name="flame"
              size={16}
              color={streak.isActive ? '#FF9800' : '#BDBDBD'}
            />
            <Text style={[
              styles.streakText,
              !streak.isActive && styles.streakInactive,
            ]}>
              {streak.currentStreak} day streak
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelBadge: {
    backgroundColor: '#F9A825',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  levelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  xpText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3E4751',
    fontFamily: 'Space Grotesk',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F9A825',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#757575',
    fontFamily: 'Space Grotesk',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
    fontFamily: 'Space Grotesk',
  },
  streakInactive: {
    color: '#BDBDBD',
  },
  // Compact styles
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactLevel: {
    backgroundColor: '#F9A825',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  compactLevelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  compactBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
  },
  compactBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F9A825',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9800',
    fontFamily: 'Space Grotesk',
  },
});

export default XPProgress;
