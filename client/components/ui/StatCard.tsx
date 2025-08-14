import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

interface StatCardProps {
  title: string;
  value: string;
  valueStyle: 'digital' | 'orbitron' | 'vt323' | 'shareTech';
}

const StatCard = ({ title, value, valueStyle }: StatCardProps) => {
  const getValueTextStyle = () => {
    switch (valueStyle) {
      case 'digital':
        return styles.digitalValue;
      case 'orbitron':
        return styles.orbitronValue;
      case 'vt323':
        return styles.vt323Value;
      case 'shareTech':
        return styles.shareTechValue;
      default:
        return styles.digitalValue;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.value, getValueTextStyle()]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    padding: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 1,
      height: 2.2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    textAlign: 'center',
  },
  value: {
    fontSize: 24,
    lineHeight: 30,
    color: '#000000',
  },
  digitalValue: {
    fontFamily: 'Digital Numbers',
    fontWeight: '400',
  },
  orbitronValue: {
    fontFamily: 'Orbitron',
    fontWeight: '700',
    fontSize: 22,
  },
  vt323Value: {
    fontFamily: 'VT323',
    fontWeight: '400',
  },
  shareTechValue: {
    fontFamily: 'Share Tech Mono',
    fontWeight: '400',
  },
});

export default StatCard;
