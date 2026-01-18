import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';

interface JourneyCardProps {
  id?: string;
  title: string;
  stats: string;
  imageUrl: string;
  onPress?: () => void;
}

const JourneyCard = ({ id, title, stats, imageUrl, onPress }: JourneyCardProps): React.JSX.Element => {
  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <Image 
        source={imageUrl ? { uri: imageUrl } : require('../../assets/placeholder-journey.jpg')} 
        style={styles.image}
        contentFit="cover"
        transition={200}
        // onError={(error) => console.log('Image load error:', error)}
        // defaultSource={require('../../assets/placeholder-journey.jpg')} // expo-image handles fallback differently or via state, but simple conditional source is often enough or placeholder prop
        placeholder={require('../../assets/placeholder-journey.jpg')}
      />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.stats}>{stats}</Text>
      </View>
    </TouchableOpacity>
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
