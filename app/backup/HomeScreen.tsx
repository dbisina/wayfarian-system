import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../components/ui/Header';
import UserProfile from '../components/ui/UserProfile';
import StatsGrid from '../components/ui/StatsGrid';
import XPProgress from '../components/ui/XPProgress';
import Achievements from '../components/ui/Achievements';
import PastJourneys from '../components/ui/PastJourneys';
import StartJourneyButton from '../components/ui/StartJourneyButton';

interface HomeScreenProps {
  onTabPress?: (tab: string) => void;
}

const HomeScreen = ({onTabPress}: HomeScreenProps): JSX.Element => {
  return (
    <View style={styles.container}>
      <Header onSettingsPress={() => onTabPress?.('settings')} />
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <UserProfile />
        <StatsGrid />
        <XPProgress />
        <Achievements />
        <PastJourneys onSeeAllPress={() => onTabPress?.('log')} />
        <StartJourneyButton />
      </ScrollView>
      {/* BottomNavigation component not available in this project */}
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

export default HomeScreen;
