import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export default function AuthLayout() {
  const { hasCompletedOnboarding, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Note: Root _layout.tsx handles the auth → tabs switch
  // so we don't need to redirect here (that caused snap-back flicker)

  const initialRouteName = hasCompletedOnboarding ? 'login' : 'index';

  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
      <Stack.Screen name="index" />
      <Stack.Screen name="step2" />
      <Stack.Screen name="step3" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}

