import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import Header from '../../components/ui/Header';
import UserProfile from '../../components/ui/UserProfile';
import StatsGrid from '../../components/ui/StatsGrid';
import XPProgress from '../../components/ui/XPProgress';
import Achievements from '../../components/ui/Achievements';
import PastJourneys from '../../components/ui/PastJourneys';
import StartJourneyButton from '../../components/ui/StartJourneyButton';

export default function HomeScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Header onSettingsPress={() => router.push('/settings')} />
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <UserProfile />
        <StatsGrid />
        <XPProgress />
        <Achievements />
        <PastJourneys onSeeAllPress={() => {}} />
        <StartJourneyButton />
      </ScrollView>
    </View>
  );
};

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

