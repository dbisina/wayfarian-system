import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

interface JourneyCardProps {
  title: string;
  stats: string;
  imageUrl: string;
}

const JourneyCard = ({ title, stats, imageUrl }: JourneyCardProps): React.JSX.Element => {
  return (
    <View style={styles.container}>
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.stats}>{stats}</Text>
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
    height: 90,
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
  stats: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
});

export default JourneyCard;
