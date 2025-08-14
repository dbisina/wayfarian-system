import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import JourneyCard from './JourneyCard';

const PastJourneys = () => {
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

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Past Journeys</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {journeys.map((journey) => (
          <JourneyCard
            key={journey.id}
            title={journey.title}
            stats={journey.stats}
            imageUrl={journey.imageUrl}
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
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 28,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
});

export default PastJourneys;
