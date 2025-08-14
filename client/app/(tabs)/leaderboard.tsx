import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../../components/layout/Header';
import TabNavigation from '../../components/layout/TabNavigation';
import LeaderboardList from '../../components/ui/LeaderboardList';
import UserRankCard from '../../components/ui/UserRankCard';
import BottomNavigation from '../../components/navigation/BottomNavigation';

const LeaderboardScreen = () => {
  return (
    <View style={styles.container}>
      <Header />
      <TabNavigation />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <LeaderboardList />
      </ScrollView>
      <UserRankCard />
      <BottomNavigation activeTab="leaderboard" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
});

export default LeaderboardScreen;
