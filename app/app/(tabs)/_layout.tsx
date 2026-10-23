import { Tabs, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';
import React, { useEffect, useState } from 'react';

import DWTabBar from '@/components/dw/TabBar';
import { useAuth } from '../../contexts/AuthContext';
import ActivityModal from '../../scaf/ActivityModal';
import { useKeyboardHeight } from '../../components/dw/KeyboardInset';
import FloatingJourneyStatus from '../../components/FloatingJourneyStatus';

export default function TabLayout() {
  const keyboardOpen = useKeyboardHeight() > 0;
  const [rideMenuOpen, setRideMenuOpen] = useState(false);
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inTabsGroup = segments[0] === '(tabs)';
    if (!isAuthenticated && inTabsGroup) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, loading, segments, router]);

  if (loading) return null;
  if (!isAuthenticated) return null; // Will redirect to login

  const active = ((segments as string[])[1] as string | undefined) ?? 'index';
  const navigate = (name: string) => {
    router.navigate((name === 'index' ? '/(tabs)' : `/(tabs)/${name}`) as never);
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={() => null}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="map" options={{ title: 'Map' }} />
        <Tabs.Screen name="log" options={{ title: 'Log' }} />
        <Tabs.Screen name="leaderboard" options={{ title: 'Ranks' }} />
      </Tabs>
      <FloatingJourneyStatus />
      <ActivityModal visible={rideMenuOpen} onClose={() => setRideMenuOpen(false)} />
      {!keyboardOpen && <DWTabBar active={active} onNavigate={navigate} open={rideMenuOpen} onCenter={() => setRideMenuOpen((v) => !v)} />}
    </View>
  );
}
