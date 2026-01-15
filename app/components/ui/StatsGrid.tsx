import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import StatCard from './StatCard';
import { userAPI } from '../../services/api';
import { StatsCalculator } from '../../utils/StatsCalculator';
import { useSettings } from '../../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';

interface JourneyData {
  id: string;
  title: string;
  totalDistance: number;
  totalTime: number;
  avgSpeed: number;
  topSpeed: number;
  status: string;
}

interface StatsData {
  totalDistance: number;
  totalTime: number;
  avgSpeed: number;
  maxSpeed: number;
  maxSpeedJourneyTitle: string;
}

const StatsGrid = (): React.JSX.Element => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { convertDistance, convertSpeed } = useSettings();
  const { t } = useTranslation();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        // Fetch all completed journeys
        const response = await userAPI.getJourneyHistory({
          status: 'COMPLETED',
          limit: 100,
          sortBy: 'startTime',
          sortOrder: 'desc',
        });

        const journeys: JourneyData[] = response?.journeys || [];

        if (journeys.length === 0) {
          setStats({
            totalDistance: 0,
            totalTime: 0,
            avgSpeed: 0,
            maxSpeed: 0,
            maxSpeedJourneyTitle: '',
          });
          return;
        }

        // Calculate total distance (sum of all journey distances)
        const totalDistance = journeys.reduce(
          (sum, j) => sum + (j.totalDistance || 0),
          0
        );

        // Calculate total time (sum of all journey times)
        const totalTime = journeys.reduce(
          (sum, j) => sum + (j.totalTime || 0),
          0
        );

        // Calculate average speed (average of all journey avg speeds, excluding nulls)
        const journeysWithAvgSpeed = journeys.filter(
          (j) => j.avgSpeed != null && j.avgSpeed > 0
        );
        const avgSpeed =
          journeysWithAvgSpeed.length > 0
            ? journeysWithAvgSpeed.reduce((sum, j) => sum + j.avgSpeed, 0) /
              journeysWithAvgSpeed.length
            : 0;

        // Find journey with max speed
        const maxSpeedJourney = journeys.reduce(
          (max, j) => ((j.topSpeed || 0) > (max.topSpeed || 0) ? j : max),
          journeys[0]
        );

        setStats({
          totalDistance,
          totalTime,
          avgSpeed,
          maxSpeed: maxSpeedJourney?.topSpeed || 0,
          maxSpeedJourneyTitle: maxSpeedJourney?.title || '',
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        setStats({
          totalDistance: 0,
          totalTime: 0,
          avgSpeed: 0,
          maxSpeed: 0,
          maxSpeedJourneyTitle: '',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  }

  // Format values with unit conversion
  const distanceValue = stats
    ? convertDistance(stats.totalDistance)
    : '0 km';
  const timeValue = stats
    ? StatsCalculator.formatLargeDuration(stats.totalTime)
    : '0m';
  const avgSpeedValue = stats
    ? convertSpeed(stats.avgSpeed)
    : '0 km/h';
  const maxSpeedValue = stats
    ? convertSpeed(stats.maxSpeed)
    : '0 km/h';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <StatCard
          title={t('components.statsGrid.distanceCovered')}
          value={distanceValue}
          valueStyle="digital"
        />
        <StatCard
          title={t('components.statsGrid.timeTraveled')}
          value={timeValue}
          valueStyle="orbitron"
        />
      </View>
      <View style={styles.row}>
        <StatCard
          title={t('components.statsGrid.avgSpeed')}
          value={avgSpeedValue}
          valueStyle="vt323"
        />
        <StatCard
          title={t('components.statsGrid.maxSpeed')}
          value={maxSpeedValue}
          subtitle={stats?.maxSpeedJourneyTitle || undefined}
          valueStyle="shareTech"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 16,
  },
  loadingContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
});

export default StatsGrid;
