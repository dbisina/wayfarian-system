import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

export interface CelebrationEvent {
  id: string;
  title: string;
  subtitle?: string;
  xp?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  event: CelebrationEvent | null;
  onDismiss: () => void;
}

const RideCelebration: React.FC<Props> = ({ event, onDismiss }) => {
  const translateY = useSharedValue(-120);
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!event) return;

    // Reset to initial values before starting new animation
    translateY.value = -120;
    scale.value = 0.8;
    opacity.value = 0;

    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate in
    translateY.value = withSequence(
      withTiming(0, { duration: 400, easing: Easing.out(Easing.back(1.2)) }),
      // Hold for 3 seconds, then animate out
      withDelay(
        3000,
        withTiming(-120, { duration: 300, easing: Easing.in(Easing.ease) })
      )
    );

    scale.value = withSequence(
      withTiming(1.05, { duration: 300 }),
      withTiming(1, { duration: 150 }),
      withDelay(3000, withTiming(0.8, { duration: 300 }))
    );

    opacity.value = withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(
        3000,
        withTiming(0, { duration: 300 }, (finished) => {
          if (finished) {
            runOnJS(dismiss)();
          }
        })
      )
    );
  }, [event]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  if (!event) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={event.icon || 'trophy'}
            size={24}
            color="#F9A825"
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>
          {event.subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {event.subtitle}
            </Text>
          )}
        </View>
        {event.xp && event.xp > 0 && (
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>+{event.xp} XP</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(249,168,37,0.3)',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(249,168,37,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  subtitle: {
    fontSize: 12,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 1,
  },
  xpBadge: {
    backgroundColor: '#F9A825',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  xpText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
});

export default RideCelebration;
