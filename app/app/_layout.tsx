import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import GroupJourneyGlobalListener from '../components/GroupJourneyGlobalListener';
import { store, persistor } from '../store';
import { initSentry } from '../services/sentry';

// Initialize Sentry error tracking (must be early in app lifecycle)
initSentry();

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();
if (typeof SplashScreen.setOptions === 'function' && Constants?.appOwnership !== 'expo') {
  SplashScreen.setOptions({
    duration: 400,
    fade: true,
  });
} else if (typeof SplashScreen.setOptions !== 'function') {
  console.info('SplashScreen.setOptions unavailable in current runtime; skipping custom animation.');
}
export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, hasCompletedOnboarding, loading: authLoading } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);

  const [fontsLoaded] = useFonts({
    'Digital Numbers': require('../assets/fonts/DigitalNumbers.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded && !authLoading) {
      setNavigationReady(true);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authLoading]);

  // Show splash while loading fonts or auth state
  if (!fontsLoaded || authLoading || !navigationReady) {
    return null;
  }

  const stackScreenOptions = { headerShown: false };

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={stackScreenOptions}>
        {isAuthenticated ? (
          <Stack.Screen name="(tabs)" />
        ) : hasCompletedOnboarding ? (
          <Stack.Screen name="(auth)" />
        ) : (
          <Stack.Screen name="(onboarding)" />
        )}
        <Stack.Screen name="group-detail" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="new-group" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="new-journey" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
      
      {/* Global listener for group journey start events */}
      <GroupJourneyGlobalListener />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <AuthProvider>
          <JourneyProvider>
            <RootLayoutContent />
          </JourneyProvider>
        </AuthProvider>
      </PersistGate>
    </Provider>
  );
}

