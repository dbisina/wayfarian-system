import React from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import StatCard from './StatCard';

const StatsGrid = (): React.JSX.Element => {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <StatCard
          title="Distance Covered"
          value="1,234mi"
          valueStyle="digital"
        />
        <StatCard
          title="Time Traveled"
          value="24h 30m"
          valueStyle="orbitron"
        />
      </View>
      <View style={styles.row}>
        <StatCard
          title="Avg. Speed"
          value="55 mph"
          valueStyle="vt323"
        />
        <StatCard
          title="Max Speed"
          value="120 mph"
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
  row: {
    flexDirection: 'row',
    gap: 16,
  },
});

export default StatsGrid;
