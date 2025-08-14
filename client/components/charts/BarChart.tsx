import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BarChartData {
  height: number;
  day: string;
}

interface BarChartProps {
  data: BarChartData[];
}

const BarChart = ({ data }: BarChartProps) => {
  const maxHeight = Math.max(...data.map(item => item.height));
  
  return (
    <View style={styles.container}>
      <View style={styles.chartContainer}>
        {data.map((item, index) => (
          <View key={index} style={styles.barContainer}>
            <View style={styles.barWrapper}>
              <View 
                style={[
                  styles.bar, 
                  { 
                    height: (item.height / maxHeight) * 137,
                    width: index === 0 || index === 2 ? 28 : index === 1 ? 23 : index === 3 || index === 6 ? 24 : index === 4 ? 16 : 21
                  }
                ]} 
              />
            </View>
            <Text style={styles.dayLabel}>{item.day}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 181,
    gap: 24,
  },
  barContainer: {
    alignItems: 'center',
    gap: 24,
  },
  barWrapper: {
    height: 137,
    justifyContent: 'flex-end',
  },
  bar: {
    backgroundColor: '#FFFFBF',
    borderTopWidth: 2,
    borderTopColor: '#FFFFBF',
  },
  dayLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    lineHeight: 20,
    color: '#FFFFBF',
    height: 20,
  },
});

export default BarChart;
