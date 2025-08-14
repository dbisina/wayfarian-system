import React from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import LeaderboardItem from './LeaderboardItem';
import { leaderboardData } from '../../data/leaderboardData';

const LeaderboardList = () => {
  return (
    <View style={styles.container}>
      {leaderboardData.map((item, index) => (
        <LeaderboardItem
          key={item.id}
          rank={item.rank}
          country={item.country}
          distance={item.distance}
          avatar={item.avatar}
          isLast={index === leaderboardData.length - 1}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
  },
});

export default LeaderboardList;
