import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BarChart from './BarChart';

interface ChartData {
  day: string;
  height: number;
  value: number;
}

const DistanceChart = () => {
  const chartData: ChartData[] = [
    { day: 'Mon', height: 137, value: 45 },
    { day: 'Tue', height: 110, value: 38 },
    { day: 'Wed', height: 125, value: 42 },
    { day: 'Thu', height: 95, value: 32 },
    { day: 'Fri', height: 75, value: 25 },
    { day: 'Sat', height: 88, value: 30 },
    { day: 'Sun', height: 102, value: 35 },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Distance Covered</Text>
        <Text style={styles.value}>1,250 kilometers</Text>
        <Text style={styles.period}>Last 30 Days</Text>
        <BarChart data={chartData} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  content: {
    paddingHorizontal: 16,
    gap: 8,
  },
  title: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: '#000000',
  },
  value: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    lineHeight: 40,
    color: '#000000',
  },
  period: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFBF',
    marginBottom: 8,
  },
});

export default DistanceChart;
