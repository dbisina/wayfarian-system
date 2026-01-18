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
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { AlertProvider } from '../contexts/AlertContext';
import { LiquidAlert } from '../components/ui/LiquidAlert';
import GroupJourneyGlobalListener from '../components/GroupJourneyGlobalListener';
import { store, persistor } from '../store';
import { initSentry } from '../services/sentry';
import { initI18n } from '../i18n';

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
  const { isAuthenticated, isInitializing, hasCompletedProfileSetup, isNewSignUp } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);
  const [isI18nReady, setIsI18nReady] = useState(false);

  const [fontsLoaded] = useFonts({
    'Digital Numbers': require('../assets/fonts/DigitalNumbers.ttf'),
  });

  // Initialize i18n on mount
  useEffect(() => {
    initI18n().then(() => setIsI18nReady(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && !isInitializing && isI18nReady) {
      setNavigationReady(true);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitializing, isI18nReady]);

  // Show splash while loading fonts, auth state, or i18n
  if (!fontsLoaded || isInitializing || !navigationReady || !isI18nReady) {
    return null;
  }

  const stackScreenOptions = { headerShown: false };

  // Determine which screen to show:
  // 1. Not authenticated -> (auth) for login/register
  // 2. Authenticated but new signup needs profile setup -> (auth)/profile-setup
  // 3. Fully authenticated -> (tabs)
  const showAuth = !isAuthenticated;
  const needsProfileSetup = isAuthenticated && (isNewSignUp || !hasCompletedProfileSetup);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={stackScreenOptions}>
        {showAuth ? (
          <Stack.Screen name="(auth)" />
        ) : needsProfileSetup ? (
          <Stack.Screen 
            name="(auth)" 
            initialParams={{ screen: 'profile-setup' }}
          />
        ) : (
          <Stack.Screen name="(tabs)" />
        )}
        <Stack.Screen name="group-detail" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="new-group" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="new-journey" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
      
      {/* Global listener for group journey start events */}
      <GroupJourneyGlobalListener />
      <LiquidAlert />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <AuthProvider>
              <AlertProvider>
                <SettingsProvider>
                  <JourneyProvider>
                    <RootLayoutContent />
                  </JourneyProvider>
                </SettingsProvider>
              </AlertProvider>
          </AuthProvider>
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
}

