import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { JourneyProvider } from '../contexts/JourneyContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { AlertProvider } from '../contexts/AlertContext';
import { LiquidAlert } from '../components/ui/LiquidAlert';
import GroupJourneyGlobalListener from '../components/GroupJourneyGlobalListener';
import StaleRideRecovery from '../components/StaleRideRecovery';
import { store, persistor } from '../store';
import { initSentry } from '../services/sentry';
import { initI18n } from '../i18n';
import { parseNotificationData } from '../services/notificationService';
import OfflineQueueService from '../services/offlineQueueService';
import LiveNotificationService from '../services/liveNotificationService';

// Initialize Sentry error tracking (must be early in app lifecycle)
initSentry();

// Initialize offline queue for network resilience
OfflineQueueService.initialize();

// Pre-initialize Android notification channel at app startup
LiveNotificationService.initializeChannel();

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
  const { isAuthenticated, isInitializing, hasCompletedProfileSetup, isNewSignUp, hasCompletedOnboarding } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);
  const [isI18nReady, setIsI18nReady] = useState(false);
  const router = useRouter(); // Must be called before any early returns
  const notificationResponseListener = useRef<Notifications.Subscription>(undefined);

  const [fontsLoaded] = useFonts({
    'Digital Numbers': require('../assets/fonts/DigitalNumbers.ttf'),
  });

  // Initialize i18n on mount
  useEffect(() => {
    initI18n().then(() => setIsI18nReady(true));
  }, []);

  // Handle notification taps - navigate to appropriate screen
  useEffect(() => {
    // Handle notification that opened the app
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) {
        handleNotificationNavigation(response.notification);
      }
    });

    // Handle notifications while app is running
    notificationResponseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationNavigation(response.notification);
    });

    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, []);

  // Navigate based on notification data
  const handleNotificationNavigation = (notification: Notifications.Notification) => {
    const data = parseNotificationData(notification);
    if (!data) return;

    console.log('[Notification] Handling notification tap:', data);

    switch (data.type) {
      case 'JOURNEY_REMINDER':
      case 'JOURNEY_READY':
        // Navigate to future rides screen for journey reminders
        if (data.journeyId) {
          router.push('/future-rides' as any);
        }
        break;
      case 'GROUP_JOURNEY_STARTED':
        // Navigate to the group journey
        if (data.groupJourneyId) {
          router.push({
            pathname: '/group-journey',
            params: { groupJourneyId: data.groupJourneyId },
          } as any);
        }
        break;
      default:
        console.log('[Notification] Unknown notification type:', data.type);
    }
  };

  useEffect(() => {
    if (fontsLoaded && !isInitializing && isI18nReady) {
      setNavigationReady(true);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitializing, isI18nReady]);

  // Determine navigation state
  const showAuth = !isAuthenticated;
  const needsProfileSetup = isAuthenticated && (isNewSignUp || !hasCompletedProfileSetup);

  // Handle redirection to profile-setup when needed
  // This is required because just updating initialParams on an existing stack
  // doesn't always trigger a navigation action in Expo Router.
  useEffect(() => {
    if (navigationReady && isAuthenticated && needsProfileSetup) {
      router.replace('/profile-setup' as any);
    }
  }, [navigationReady, isAuthenticated, needsProfileSetup, router]);

  // Show splash while loading fonts, auth state, or i18n
  if (!fontsLoaded || isInitializing || !navigationReady || !isI18nReady) {
    return null;
  }

  const stackScreenOptions = { headerShown: false };

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
        <Stack.Screen name="group-journey-detail" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
      
      {/* Global listener for group journey start events */}
      <GroupJourneyGlobalListener />
      <StaleRideRecovery />
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

