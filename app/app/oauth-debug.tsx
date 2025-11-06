import React from 'react';
import { View, StyleSheet } from 'react-native';
import OAuthDebugScreen from '../components/OAuthDebugScreen';

export default function OAuthDebugRoute() {
  return (
    <View style={styles.container}>
      <OAuthDebugScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
