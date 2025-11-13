import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import 'react-native-reanimated';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import GroupJourneyGlobalListener from '../components/GroupJourneyGlobalListener';
import { store, persistor } from '../store';
import { initSentry } from '../services/sentry';

// Initialize Sentry error tracking (must be early in app lifecycle)
initSentry();

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Digital Numbers': require('../assets/fonts/DigitalNumbers.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // Check onboarding status
    const checkOnboardingStatus = async () => {
      try {
        // Simulate checking onboarding status
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // For now, we'll start with onboarding not completed
        // In a real app, you'd check your onboarding status here
        setHasCompletedOnboarding(false);
      } catch (error) {
        console.error('Error checking onboarding status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboardingStatus();
  }, []);

  if (!fontsLoaded || isLoading) {
    return null; // Font loading and onboarding check
  }

  const stackScreenOptions = { headerShown: false };

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <AuthProvider>
          <JourneyProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack screenOptions={stackScreenOptions}>
                {!hasCompletedOnboarding ? (
                  <Stack.Screen name="(onboarding)" />
                ) : (
                  <>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(tabs)" />
                  </>
                )}
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              </Stack>
              <StatusBar style="auto" />
              
              {/* Floating journey status overlay moved to Home screen (only show on Home) */}

              {/* Global listener for group journey start events */}
              <GroupJourneyGlobalListener />
            </ThemeProvider>
          </JourneyProvider>
        </AuthProvider>
      </PersistGate>
    </Provider>
  );
}
