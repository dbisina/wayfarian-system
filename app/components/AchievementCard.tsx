import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

interface AchievementCardProps {
  title: string;
  description: string;
  imageUrl: string;
  key?: string;
}

const AchievementCard = ({ title, description, imageUrl }: AchievementCardProps): React.ReactElement => {
  return (
    <View style={styles.container}>
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 160,
    borderRadius: 8,
    gap: 16,
  },
  image: {
    width: 160,
    height: 160,
    borderRadius: 12,
  },
  content: {
    gap: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
});

export default AchievementCard;
