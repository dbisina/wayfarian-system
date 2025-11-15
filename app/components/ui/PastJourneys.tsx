import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import JourneyCard from './JourneyCard';

interface PastJourneysProps {
  onSeeAllPress?: () => void;
}

const PastJourneys = ({ onSeeAllPress }: PastJourneysProps): React.JSX.Element => {
  const journeys = [
    {
      id: '1',
      title: 'Mountain Pass Adventure',
      stats: '250 mi | 5h 15m',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/NisRaj6rsa.png',
    },
    {
      id: '2',
      title: 'Night City Cruise',
      stats: '180 mi | 3h 45m',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/EdecqWFNAy.png',
    },
    {
      id: '3',
      title: 'Coastal Escape',
      stats: '320 mi | 6h 30m',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/L0QJMvperJ.png',
    },
  ];

  const handleJourneyPress = (journeyId: string) => {
    router.push(`/journey-detail?journeyId=${journeyId}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          style={styles.seeAllButton}
          onPress={onSeeAllPress}
          activeOpacity={0.7}
        >
          <Text style={styles.seeAllText}>See all</Text>
          <Text style={styles.seeAllArrow}>→</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {journeys.map((journey) => (
          <JourneyCard
            key={journey.id}
            id={journey.id}
            title={journey.title}
            stats={journey.stats}
            imageUrl={journey.imageUrl}
            onPress={() => handleJourneyPress(journey.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 28,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: 'Space Grotesk',
    marginRight: 4,
  },
  seeAllArrow: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    fontFamily: 'Space Grotesk',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
});

export default PastJourneys;
