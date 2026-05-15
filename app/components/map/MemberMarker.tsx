/**
 * Animated map marker representing a single group-journey participant.
 *
 * Position is smoothly interpolated over 1 s to match the 1 Hz Firebase update
 * interval, eliminating the "teleporting dot" look. Heading animation uses
 * Animated.Value (not useNativeDriver on web) because react-native-maps'
 * AnimatedRegion does not support the native driver.
 *
 * @prop member          - Participant data including latest lat/lng and heading.
 * @prop convertDistance - Formatter from the parent's unit-conversion context.
 */

import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Platform, Animated } from 'react-native';
import { Marker, AnimatedRegion } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';

interface MemberMarkerProps {
  member: {
    userId: string;
    displayName: string;
    photoURL?: string;
    latitude: number;
    longitude: number;
    heading?: number;
    status: string;
    totalDistance?: number;
  };
  convertDistance: (dist: number) => string;
}

const MemberMarker = ({ member, convertDistance }: MemberMarkerProps) => {
  const markerPosition = useRef(new AnimatedRegion({
    latitude: member.latitude,
    longitude: member.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  })).current;

  const markerRotation = useRef(new Animated.Value(member.heading || 0)).current;

  useEffect(() => {
    // 1000 ms matches the 1 Hz Firebase update interval so each animation
    // completes before the next location arrives.
    markerPosition.timing({
      latitude: member.latitude,
      longitude: member.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      duration: 1000,
      useNativeDriver: false,
    } as any).start();

    if (member.heading !== undefined) {
      Animated.timing(markerRotation, {
        toValue: member.heading,
        duration: 600,
        // Web does not support the native driver for transform animations.
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [member.latitude, member.longitude, member.heading, markerPosition, markerRotation]);

  return (
    <Marker.Animated
      key={member.userId}
      coordinate={markerPosition as any}
      title={member.displayName}
      description={`${convertDistance(member.totalDistance || 0)} • ${member.status}`}
      anchor={{ x: 0.5, y: 0.5 }}
      flat={true}
    >
      <Animated.View style={[
        styles.memberMarker,
        {
          transform: [{
            rotate: markerRotation.interpolate({
              inputRange: [0, 360],
              outputRange: ['0deg', '360deg'],
            }),
          }],
        },
      ]}>
        <Image
          source={
            member.photoURL
              ? { uri: member.photoURL }
              : require("../../assets/images/2025-09-26/byc45z4XPi.png")
          }
          style={styles.memberImage}
        />
        {member.status === "COMPLETED" && (
          <MaterialIcons
            name="check-circle"
            size={18}
            color="#10b981"
            style={styles.statusBadge}
          />
        )}
      </Animated.View>
    </Marker.Animated>
  );
};

const styles = StyleSheet.create({
  memberMarker: {
    padding: 2,
    backgroundColor: '#fff',
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#F9A825',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  memberImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  statusBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#fff',
    borderRadius: 9,
  },
});

export default React.memo(MemberMarker);
