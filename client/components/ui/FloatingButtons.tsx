import React from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import FloatingButton from './FloatingButton';

const FloatingButtons: React.FC = () => {
  return (
    <View style={styles.container}>
      <FloatingButton
        iconUri="https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/kNGaXaF6dY.svg"
        style={styles.locationButton}
        size={50}
        borderRadius={50}
        padding={{ horizontal: 12, vertical: 13 }}
      />
      <FloatingButton
        iconUri="https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/8q8LihWJbY.svg"
        style={styles.layersButton}
        size={50}
        borderRadius={12}
        padding={{ horizontal: 11, vertical: 10 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 22,
    bottom: 147, // Above the bottom navigation area
    zIndex: 3,
  },
  locationButton: {
    marginBottom: 10,
  },
  layersButton: {
    marginBottom: 0,
  },
});

export default FloatingButtons;
