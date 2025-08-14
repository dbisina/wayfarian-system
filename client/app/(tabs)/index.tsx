import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../../components/layout/Header';
import UserProfile from '../../components/ui/UserProfile';
import StatsGrid from '../../components/ui/StatsGrid';
import XPProgress from '../../components/ui/XPProgress';
import Achievements from '../../components/ui/Achievements';
import PastJourneys from '../../components/ui/PastJourneys';
import StartJourneyButton from '../../components/ui/StartJourneyButton';
import BottomNavigation from '../../components/navigation/BottomNavigation';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Header />
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <UserProfile />
        <StatsGrid />
        <XPProgress />
        <Achievements />
        <PastJourneys />
        <StartJourneyButton />
      </ScrollView>
      <BottomNavigation activeTab="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
});
