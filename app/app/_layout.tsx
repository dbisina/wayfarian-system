import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import FloatingJourneyStatus from '../components/FloatingJourneyStatus';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return null; // You could show a loading screen here
  }

  const stackScreenOptions = { headerShown: false };

  return (
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
          
          {/* Floating journey status overlay */}
          <FloatingJourneyStatus />
        </ThemeProvider>
      </JourneyProvider>
    </AuthProvider>
  );
}
