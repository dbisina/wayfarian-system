import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../components/Header';
import UserProfile from '../components/UserProfile';
import StatsGrid from '../components/StatsGrid';
import XPProgress from '../components/XPProgress';
import Achievements from '../components/Achievements';
import PastJourneys from '../components/PastJourneys';
import StartJourneyButton from '../components/StartJourneyButton';
import BottomNavigation from '../components/BottomNavigation';

interface HomeScreenProps {
  onTabPress?: (tab: string) => void;
}

const HomeScreen = ({onTabPress}: HomeScreenProps): React.ReactElement => {
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
      <BottomNavigation activeTab="home" onTabPress={onTabPress} />
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
