import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Header from '../../components/layout/Header';
import XPProgress from '../../components/ui/XPProgress';
import StatsGrid from '../../components/ui/StatsGrid';
import BottomNavigation from '../../components/navigation/BottomNavigation';

export default function StatsScreen() {
  return (
    <View style={styles.container}>
      <Header />
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Your Progress</Text>
          <XPProgress />
          
          <Text style={styles.sectionTitle}>Statistics</Text>
          <StatsGrid />
          
          <View style={styles.achievementSection}>
            <Text style={styles.sectionTitle}>Recent Achievements</Text>
            <View style={styles.achievementCard}>
              <Text style={styles.achievementTitle}>First Journey</Text>
              <Text style={styles.achievementDesc}>Complete your first journey</Text>
              <Text style={styles.achievementDate}>2 days ago</Text>
            </View>
            <View style={styles.achievementCard}>
              <Text style={styles.achievementTitle}>Speed Demon</Text>
              <Text style={styles.achievementDesc}>Reach 25 km/h during a journey</Text>
              <Text style={styles.achievementDate}>1 week ago</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <BottomNavigation activeTab="stats" />
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
  statsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1D1B20',
    fontFamily: 'Inter',
    marginBottom: 16,
    marginTop: 8,
  },
  achievementSection: {
    marginTop: 24,
  },
  achievementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1B20',
    fontFamily: 'Inter',
    marginBottom: 4,
  },
  achievementDesc: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Inter',
    marginBottom: 8,
  },
  achievementDate: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9E9E9E',
    fontFamily: 'Inter',
  },
});
