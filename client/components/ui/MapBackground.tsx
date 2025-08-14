import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const MapBackground: React.FC = () => {
  return (
    <View style={styles.container}>
      <Image
        source={{
          uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/MM45vGjvjS.png',
        }}
        style={styles.mapImage}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
  },
  mapImage: {
    width: screenWidth + 489, // 879 - 390 = 489 extra width
    height: screenHeight,
    marginLeft: -262, // Offset to match Figma positioning
  },
});

export default MapBackground;
