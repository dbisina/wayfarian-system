import React from 'react';
import { View, StatusBar, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { PRIMARY_COLORS } from '@/constants/theme';

export default function App() {

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PRIMARY_COLORS.background} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="group-detail" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="new-group" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="new-journey" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY_COLORS.background,
  },
});
