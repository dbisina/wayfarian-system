import { Tabs, useRouter, useSegments } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing, interpolate, Extrapolation } from 'react-native-reanimated';

import { HapticTab } from '@/components/haptic-tab';
import { TAB_BAR_COLORS, SHADOW_COLORS } from '@/constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import ActivityModal from '../../scaf/ActivityModal';

// Import tab screen components directly so we can mount them in the curved bar
import HomeScreen from './index';
import MapScreen from './map';
import RideLogScreen from './log';
import LeaderboardScreen from './leaderboard';

const HapticPressable: any = HapticTab as any;

// Dynamic tab icon with adaptive spacing
function AdaptiveTabIcon({ 
  color, 
  focused, 
  iconSource, 
  title,
  onFocusChange 
}: {
  color: string;
  focused: boolean;
  iconSource: string;
  title: string;
  onFocusChange?: (focused: boolean) => void;
}) {
  const pillWidth = useSharedValue(focused ? 1 : 0);
  const iconScale = useSharedValue(focused ? 1.1 : 1);
  const textOpacity = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    // Ease-out for a smoother, modern feel
    pillWidth.value = withTiming(focused ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    iconScale.value = withTiming(focused ? 1.08 : 1, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });
    textOpacity.value = withTiming(focused ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    
    onFocusChange?.(focused);
  }, [focused]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const maxAvailableWidth = 160; // tighter cap to keep pills compact
    const calculatedWidth = title.length * 7 + 40; // slightly smaller step per char
    const maxWidth = Math.min(calculatedWidth, maxAvailableWidth);
    const width = interpolate(
      pillWidth.value,
      [0, 1],
      [30, maxWidth],
  Extrapolation.CLAMP
    );
    return { width, opacity: 1 };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: iconScale.value },
  { translateX: interpolate(pillWidth.value, [0, 1], [0, -2], Extrapolation.CLAMP) },
    ],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [
  { translateX: interpolate(pillWidth.value, [0, 1], [6, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={styles.tabIconContainer}>
      {focused ? (
        <Animated.View style={[styles.groupsTab, pillAnimatedStyle]}>
          <Animated.View style={iconAnimatedStyle}>
            <Image source={{ uri: iconSource }} style={styles.tabIcon} />
          </Animated.View>
          <Animated.View style={textAnimatedStyle}>
            <Text style={styles.groupsTabText} numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : (
        <Image source={{ uri: iconSource }} style={styles.tabIcon} />
      )}
    </View>
  );
}

export default function TabLayout() {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  // Subtle screen transition overlay
  const transition = useSharedValue(0);
  const transitionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(transition.value, [0, 1], [0, 0.12], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(transition.value, [0, 1], [0, 6], Extrapolation.CLAMP) },
    ],
  }));

  useEffect(() => {
    if (loading) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && inTabsGroup) {
      // User is not authenticated but in tabs, redirect to login
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, loading, segments, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F9A825" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }
  
  // Tabs bar config to mimic current style while using Tabs behavior
  const BAR_HEIGHT = 44;
  const BOTTOM_OFFSET = 16; // similar to example
  const H_MARGIN = 28; // compact but leaves room for labels
  const NOTCH_DIAMETER = 52; // recess size under the FAB
  const NOTCH_RADIUS = NOTCH_DIAMETER / 2;

  return (
    <>
      {/* Subtle crossfade/slide overlay on tab change */}
      <Animated.View pointerEvents="none" style={[styles.transitionOverlay, transitionAnimatedStyle]} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: TAB_BAR_COLORS.activeText,
          tabBarInactiveTintColor: TAB_BAR_COLORS.inactiveText,
          tabBarButton: HapticTab,
          tabBarLabelStyle: { display: 'none' },
          tabBarStyle: {
            position: 'absolute',
            bottom: BOTTOM_OFFSET,
            marginHorizontal: H_MARGIN,
            backgroundColor: TAB_BAR_COLORS.background,
            borderRadius: 24,
            height: BAR_HEIGHT,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-around',
            paddingVertical: 4,
            paddingHorizontal: 6,
            shadowColor: SHADOW_COLORS.primary,
            shadowOffset: { width: 1, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <AdaptiveTabIcon
                color={color as string}
                focused={!!focused}
                iconSource="https://static.codia.ai/image/2025-10-15/y2W4CRNORb.png"
                title="Home"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
                    setActiveTabIndex(0);
                    transition.value = 1;
                    transition.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
                  }
                }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Map',
            tabBarIcon: ({ color, focused }) => (
              <AdaptiveTabIcon
                color={color as string}
                focused={!!focused}
                iconSource="https://static.codia.ai/image/2025-10-15/1bd3DwwpQG.png"
                title="Map"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
                    setActiveTabIndex(1);
                    transition.value = 1;
                    transition.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
                  }
                }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="log"
          options={{
            title: 'Log',
            tabBarIcon: ({ color, focused }) => (
              <AdaptiveTabIcon
                color={color as string}
                focused={!!focused}
                iconSource="https://static.codia.ai/image/2025-10-15/tQcweNppVu.png"
                title="Log"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
                    setActiveTabIndex(2);
                    transition.value = 1;
                    transition.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
                  }
                }}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="leaderboard"
          options={{
            title: 'Trophy',
            tabBarIcon: ({ color, focused }) => (
              <AdaptiveTabIcon
                color={color as string}
                focused={!!focused}
                iconSource="https://static.codia.ai/image/2025-10-15/g0HQMrSGro.png"
                title="Trophy"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
                    setActiveTabIndex(3);
                    transition.value = 1;
                    transition.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
                  }
                }}
              />
            ),
          }}
        />
      </Tabs>

      {/* Curved recess overlay (centered circle using screen bg color) */}
      <View
        pointerEvents="none"
        style={[
          styles.recessCutout,
          {
            width: NOTCH_DIAMETER,
            height: NOTCH_DIAMETER,
            borderRadius: NOTCH_RADIUS,
            bottom: BOTTOM_OFFSET + BAR_HEIGHT - NOTCH_RADIUS + 2, // align with bar top
          },
        ]}
      />

      {/* Floating Center Button overlay */}
      <View style={styles.floatingButtonContainerTabs} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => setActivityModalVisible(true)}
          accessibilityRole="button"
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-10-15/sZMbhKBvpn.png' }}
            style={styles.floatingIcon}
          />
        </TouchableOpacity>
      </View>

      {/* Activity modal opened by the center FAB */}
      {/* FAB is 38px tall; to sit 10px above its top edge, add half FAB height + 10 */}
      <ActivityModal
        visible={activityModalVisible}
        onClose={() => setActivityModalVisible(false)}
        anchorBottom={BOTTOM_OFFSET + BAR_HEIGHT + (38 / 2) + 10}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  tabIcon: {
    width: 22,
    height: 22,
  },
  groupsTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TAB_BAR_COLORS.activeBackground,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 6,
    height: 32,
    gap: 4,
    shadowColor: SHADOW_COLORS.primary,
    shadowOffset: { width: 0, height: 2.2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  groupsTabText: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Poppins',
    color: TAB_BAR_COLORS.activeText,
    textAlign: 'center',
    lineHeight: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontFamily: 'Space Grotesk',
  },
  // Floating look shadow for the bar itself
  shadow: {
    shadowColor: SHADOW_COLORS.primary,
    shadowOffset: { width: 1, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomBar: {
    // container style is supplied via style prop on Navigator above
  },
  // Center button container (renderCircle) — lift above bar
  btnCircleUp: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  // Floating FAB when using Tabs (overlay)
  floatingButtonContainerTabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 44, // sits slightly above the tab bar; tuned with tabBarStyle.bottom
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    pointerEvents: 'box-none',
  },
  floatingButton: {
    width: 38,
    height: 38,
    backgroundColor: '#FFFFFF',
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingIcon: {
    width: 38,
    height: 38,
  },
  recessCutout: {
    position: 'absolute',
    left: '50%',
    marginLeft: -26, // half of NOTCH_DIAMETER
    backgroundColor: '#FFFFFF', // screen background to fake the cutout
    zIndex: 5,
  },
  transitionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1,
  },
  fab: {
    width: 34,
    height: 34,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  fabIcon: {
    width: 34,
    height: 34,
  },
  tabbarItem: {
    // Remove flex so items don't over-distribute space
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginHorizontal: 1, // ~2px total gap between items like example
  },
});