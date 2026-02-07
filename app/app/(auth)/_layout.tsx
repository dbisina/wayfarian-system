import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEffect, useRef } from 'react';

export default function AuthLayout() {
  const { hasCompletedOnboarding, isAuthenticated, loading, isInitializing } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const hasNavigatedRef = useRef(false);

  // Navigate away from onboarding if user has completed it OR is already authenticated
  // initialRouteName only works on first mount, so we need useEffect for subsequent state changes
  useEffect(() => {
    if (loading || isInitializing) return;

    const currentScreen = segments[segments.length - 1] as any;
    const isOnOnboardingScreen = currentScreen === 'index' || currentScreen === 'step2' || currentScreen === 'step3' || currentScreen === '(auth)';

    if ((hasCompletedOnboarding || isAuthenticated) && isOnOnboardingScreen && !hasNavigatedRef.current) {
      console.log('[AuthLayout] User completed onboarding or is authenticated, redirecting to login');
      hasNavigatedRef.current = true;
      router.replace('/(auth)/login');
    }
  }, [hasCompletedOnboarding, isAuthenticated, segments, router, loading, isInitializing]);

  // Reset navigation flag when onboarding status changes
  useEffect(() => {
    hasNavigatedRef.current = false;
  }, [hasCompletedOnboarding]);

  // Wait for both loading AND initialization to complete
  // isInitializing includes onboarding status check from AsyncStorage
  if (loading || isInitializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const initialRouteName = hasCompletedOnboarding ? 'login' : 'index';

  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
      <Stack.Screen name="index" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
