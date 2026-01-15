import { Tabs, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, Image, TouchableOpacity, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing, interpolate, Extrapolation } from 'react-native-reanimated';

import { HapticTab } from '@/components/haptic-tab';
import { TAB_BAR_COLORS, SHADOW_COLORS } from '@/constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import ActivityModal from '../../scaf/ActivityModal';

// Dynamic tab icon with pill-shaped embossment
function AdaptiveTabIcon({ 
  color, 
  focused, 
  iconSource, 
  title,
  onFocusChange 
}: {
  color: string;
  focused: boolean;
  iconSource: number; // require() returns a number
  title: string;
  onFocusChange?: (focused: boolean) => void;
}) {
  const pillWidth = useSharedValue(focused ? 1 : 0);
  const pillScale = useSharedValue(focused ? 1 : 0.95);
  const iconScale = useSharedValue(focused ? 1.05 : 1);
  const textOpacity = useSharedValue(focused ? 1 : 0);
  const pillOpacity = useSharedValue(focused ? 1 : 0.3);

  React.useEffect(() => {
    // Smooth spring animations for pill expansion
    pillWidth.value = withSpring(focused ? 1 : 0, {
      damping: 18,
      stiffness: 180,
    });
    pillScale.value = withSpring(focused ? 1 : 0.95, {
      damping: 16,
      stiffness: 200,
    });
    iconScale.value = withSpring(focused ? 1.05 : 1, {
      damping: 14,
      stiffness: 160,
    });
    textOpacity.value = withTiming(focused ? 1 : 0, {
      duration: focused ? 250 : 150,
      easing: Easing.out(Easing.cubic),
    });
    pillOpacity.value = withTiming(focused ? 1 : 0.3, {
      duration: 200,
    });
    
    onFocusChange?.(focused);
  }, [focused, onFocusChange, pillWidth, pillScale, iconScale, textOpacity, pillOpacity]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const calculatedWidth = title.length * 8 + 48;
    const maxWidth = Math.min(calculatedWidth, 140);
    const minWidth = 40;
    const width = interpolate(
      pillWidth.value,
      [0, 1],
      [minWidth, maxWidth],
      Extrapolation.CLAMP
    );
    return { 
      width, 
      opacity: pillOpacity.value,
      transform: [{ scale: pillScale.value }],
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: iconScale.value },
      { translateX: interpolate(pillWidth.value, [0, 1], [0, -4], Extrapolation.CLAMP) },
    ],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [
      { translateX: interpolate(pillWidth.value, [0, 1], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={styles.tabIconContainer}>
      <Animated.View style={[
        styles.pillEmbossment, 
        focused && styles.pillEmbossmentActive,
        pillAnimatedStyle
      ]}>
        <Animated.View style={iconAnimatedStyle}>
          <Image source={iconSource} style={styles.tabIcon} />
        </Animated.View>
        <Animated.View style={textAnimatedStyle}>
          <Text style={[
            styles.pillText,
            focused && styles.pillTextActive
          ]} numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  // Subtle screen transition value (overlay removed to avoid dual loaders)
  const transition = useSharedValue(0);

  useEffect(() => {
    if (loading) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && inTabsGroup) {
      // User is not authenticated but in tabs, redirect to login
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, loading, segments, router]);

  if (loading) {
    // Avoid overlay spinners; let navigator mount once auth settles
    return null;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }
  
  // Tabs bar config to mimic current style while using Tabs behavior
  const insets = useSafeAreaInsets();
  const BAR_HEIGHT = 44;
  const BOTTOM_OFFSET = 20 + (insets.bottom > 0 ? insets.bottom - 10 : 0); // Add inset, adjust slightly if needed
  const H_MARGIN = 22; // compact but leaves room for labels
  const NOTCH_DIAMETER = 50; // recess size under the FAB
  const NOTCH_RADIUS = NOTCH_DIAMETER / 2;

  return (
    <>
  {/* Removed transition overlay to avoid dual overlays during loading */}
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
            justifyContent: 'space-between',
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
                iconSource={require('../../assets/images/2025-10-15/y2W4CRNORb.png')}
                title="Home"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
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
                iconSource={require('../../assets/images/2025-10-15/1bd3DwwpQG.png')}
                title="Map"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
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
                iconSource={require('../../assets/images/2025-10-15/tQcweNppVu.png')}
                title="Log"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
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
                iconSource={require('../../assets/images/2025-10-15/g0HQMrSGro.png')}
                title="Trophy"
                onFocusChange={(isFocused) => {
                  if (isFocused) {
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
            source={require('../../assets/images/2025-10-15/sZMbhKBvpn.png')}
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
    height: 30,
    paddingHorizontal: 2,
    bottom: Platform.OS === 'android' ? 7 : 0
  },
  tabIcon: {
    width: 22,
    height: 22,
  },
  pillEmbossment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249, 168, 37, 0.08)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    height: 36,
    gap: 3,
    borderWidth: 0,
    borderColor: 'rgba(249, 168, 37, 0.12)',
  },
  pillEmbossmentActive: {
    backgroundColor: TAB_BAR_COLORS.activeBackground,
    borderColor: 'rgba(249, 168, 37, 0.25)',
    shadowColor: SHADOW_COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Poppins',
    color: TAB_BAR_COLORS.inactiveText,
    textAlign: 'center',
    lineHeight: 16,
  },
  pillTextActive: {
    color: TAB_BAR_COLORS.activeText,
    fontWeight: '500',
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
    gap: 2,
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
    bottom: 47, // sits slightly above the tab bar; tuned with tabBarStyle.bottom
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