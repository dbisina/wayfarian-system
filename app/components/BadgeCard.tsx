import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

interface BadgeCardProps {
  title: string;
  imageUrl: string;
}

const BadgeCard = ({title, imageUrl}: BadgeCardProps): React.ReactElement => {
  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image source={{uri: imageUrl}} style={styles.image} />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 80,
  },
  imageContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
});

export default BadgeCard;
