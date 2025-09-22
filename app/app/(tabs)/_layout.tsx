import { Tabs } from 'expo-router';
import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

import { HapticTab } from '@/components/haptic-tab';
import { TAB_BAR_COLORS, SHADOW_COLORS } from '@/constants/theme';

// Dynamic tab icon with adaptive spacing
function AdaptiveTabIcon({ 
  color, 
  focused, 
  iconName, 
  title,
  onFocusChange 
}: {
  color: string;
  focused: boolean;
  iconName: string;
  title: string;
  onFocusChange?: (focused: boolean) => void;
}) {
  const pillWidth = useSharedValue(focused ? 1 : 0);
  const iconScale = useSharedValue(focused ? 1.1 : 1);
  const textOpacity = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    pillWidth.value = withSpring(focused ? 1 : 0, {
      damping: 20,
      stiffness: 200,
    });
    iconScale.value = withSpring(focused ? 1.1 : 1, {
      damping: 15,
      stiffness: 150,
    });
    textOpacity.value = withSpring(focused ? 1 : 0, {
      damping: 18,
      stiffness: 180,
    });
    
    onFocusChange?.(focused);
  }, [focused]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    // Calculate max width based on available space (5 tabs with padding)
    const maxAvailableWidth = 280; // Approximate available width for pills
    const calculatedWidth = title.length * 8 + 40;
    const maxWidth = Math.min(calculatedWidth, maxAvailableWidth);
    
    const width = interpolate(
      pillWidth.value,
      [0, 1],
      [32, maxWidth],
      Extrapolate.CLAMP
    );
    
    return {
      width,
      opacity: 1,
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.tabIconContainer}>
      {focused ? (
        <Animated.View style={[styles.groupsTab, pillAnimatedStyle]}>
          <Animated.View style={iconAnimatedStyle}>
            <MaterialIcons name={iconName as any} size={20} color={color} />
          </Animated.View>
          <Animated.View style={textAnimatedStyle}>
            <Text style={[styles.groupsTabText, { color }]} numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : (
        <MaterialIcons name={iconName as any} size={24} color={color} />
      )}
    </View>
  );
}

export default function TabLayout() {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  
  // Calculate dynamic spacing based on active tab
  const getTabSpacing = () => {
    const baseSpacing = 8;
    const activeTabWidth = Math.max(80, ['Home', 'Map', 'Log', 'Trophy', 'Groups'][activeTabIndex].length * 8 + 40);
    const extraWidth = activeTabWidth - 80; // Extra width beyond base
    const spacingReduction = Math.min(extraWidth / 4, 4); // Distribute extra width across other tabs
    
    return Math.max(baseSpacing - spacingReduction, 2);
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_BAR_COLORS.activeText,
        tabBarInactiveTintColor: TAB_BAR_COLORS.inactiveText,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          bottom: 16,
          position: 'absolute',
          backgroundColor: TAB_BAR_COLORS.background,
          marginHorizontal: 22,
          borderRadius: 20,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 6,
          paddingHorizontal: 8,
          height: 50,
          shadowColor: SHADOW_COLORS.primary,
          shadowOffset: {
            width: 1,
            height: 3,
          },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 5,
        },
        tabBarLabelStyle: {
          display: 'none',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <AdaptiveTabIcon 
              color={color} 
              focused={focused} 
              iconName="home" 
              title="Home"
              onFocusChange={(isFocused) => isFocused && setActiveTabIndex(0)}
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
              color={color} 
              focused={focused} 
              iconName="map" 
              title="Map"
              onFocusChange={(isFocused) => isFocused && setActiveTabIndex(1)}
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
              color={color} 
              focused={focused} 
              iconName="bar-chart" 
              title="Log"
              onFocusChange={(isFocused) => isFocused && setActiveTabIndex(2)}
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
              color={color} 
              focused={focused} 
              iconName="emoji-events" 
              title="Trophy"
              onFocusChange={(isFocused) => isFocused && setActiveTabIndex(3)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, focused }) => (
            <AdaptiveTabIcon 
              color={color} 
              focused={focused} 
              iconName="people" 
              title="Groups"
              onFocusChange={(isFocused) => isFocused && setActiveTabIndex(4)}
            />
          ),
          tabBarLabelStyle: {
            display: 'none', // Hide the default label since we have custom text
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  groupsTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TAB_BAR_COLORS.activeBackground,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 6,
    height: 36,
    gap: 4,
    shadowColor: SHADOW_COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 2.2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  groupsTabText: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Poppins',
    color: TAB_BAR_COLORS.activeText,
    textAlign: 'center',
    lineHeight: 16,
  },
});
