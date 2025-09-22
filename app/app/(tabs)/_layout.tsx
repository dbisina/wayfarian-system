import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { TAB_BAR_COLORS, SHADOW_COLORS } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_BAR_COLORS.activeText,
        tabBarInactiveTintColor: TAB_BAR_COLORS.inactiveText,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          bottom: 22,
          left: 22,
          right: 22,
          backgroundColor: TAB_BAR_COLORS.background,
          borderRadius: 20,
          paddingVertical: 6,
          paddingHorizontal: 7,
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
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
        },
        tabBarLabelStyle: {
          display: 'none', // Hide labels for first 4 tabs
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name="home" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name="map" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name="bar-chart" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Trophy',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name="emoji-events" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.groupsTab, focused && styles.groupsTabActive]}>
              <MaterialIcons name="people" size={24} color={color} />
              <Text style={styles.groupsTabText}>Groups</Text>
            </View>
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
  groupsTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TAB_BAR_COLORS.activeBackground,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: SHADOW_COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 2.2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    height: 37,
  },
  groupsTabActive: {
    backgroundColor: TAB_BAR_COLORS.activeBackground,
  },
  groupsTabText: {
    fontSize: 12,
    fontWeight: '400',
    color: TAB_BAR_COLORS.activeText,
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
});
