import React from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import StatItem from './StatItem';

interface StatsPanelProps {
  stats: {
    time: string;
    speed: number;
    distance: number;
  };
}

const StatsPanel = ({ stats }: StatsPanelProps) => {
  return (
    <View style={styles.statsPanel}>
      <StatItem 
        value={stats.time}
        label="Time"
        style={styles.statItemTime}
      />
      <StatItem 
        value={stats.speed}
        unit="KPH"
        label="Speed"
        style={styles.statItemSpeed}
      />
      <StatItem 
        value={stats.distance}
        unit="KM"
        label="Distance"
        style={styles.statItemDistance}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItemTime: {
    flex: 1,
  },
  statItemSpeed: {
    flex: 1,
  },
  statItemDistance: {
    flex: 1,
  },
});

export default StatsPanel;
