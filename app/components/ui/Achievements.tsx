import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import AchievementCard from './AchievementCard';

const Achievements = (): React.JSX.Element => {
  const achievements = [
    {
      id: '1',
      title: 'First Trip',
      description: 'Completed your first journey',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/DcURWXtHxF.png',
    },
    {
      id: '2',
      title: 'Speed Demon',
      description: 'Reached 100 mph',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/F7KA62fqzv.png',
    },
    {
      id: '3',
      title: 'Longest Drive',
      description: 'Drove over 500 miles',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-13/2RPXH2xKgd.png',
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Achievements</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {achievements.map((achievement) => (
          <AchievementCard
            key={achievement.id}
            title={achievement.title}
            description={achievement.description}
            imageUrl={achievement.imageUrl}
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

export default Achievements;
