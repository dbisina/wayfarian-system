import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface StatItemProps {
  value: string | number;
  unit?: string;
  label: string;
  style?: ViewStyle;
}

const StatItem = ({ value, unit, label, style }: StatItemProps) => {
  return (
    <View style={[styles.statItem, style]}>
      <View style={styles.statValueContainer}>
        <Text style={styles.statValue}>{value}</Text>
        {unit && <Text style={styles.statUnit}>{unit}</Text>}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  statItem: {
    alignItems: 'center',
  },
  statValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1B20',
    fontFamily: 'Inter',
  },
  statUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#757575',
    marginLeft: 2,
    fontFamily: 'Inter',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Inter',
  },
});

export default StatItem;
