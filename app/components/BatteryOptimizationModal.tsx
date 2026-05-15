/**
 * Bottom-sheet prompt guiding the user to unrestrict battery so the background
 * tracking service survives screen-lock on aggressive Android ROMs (Samsung, Xiaomi,
 * Huawei, etc.). Uses notifee's power-manager APIs — no extra dependencies needed.
 *
 * Automatically dismisses itself when the user returns from Settings having
 * already unrestricted the app.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import notifee from '@notifee/react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Subset of notifee's PowerManagerInfo we actually render. */
interface PowerManagerInfo {
  manufacturer?: string;
  model?: string;
  version?: string;
  activity?: string | null;
}

/** @prop visible - Controls sheet visibility from the parent. */
interface BatteryOptimizationModalProps {
  visible: boolean;
  onDismiss: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

const BatteryOptimizationModal: React.FC<BatteryOptimizationModalProps> = ({
  visible,
  onDismiss,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [powerInfo, setPowerInfo] = useState<PowerManagerInfo | null>(null);
  const [internalVisible, setInternalVisible] = useState(false);

  const animateIn = useCallback(() => {
    setInternalVisible(true);
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropAnim, slideAnim]);

  const animateOut = useCallback(
    (afterDone: () => void) => {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 600,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setInternalVisible(false);
          afterDone();
        }
      });
    },
    [backdropAnim, slideAnim],
  );

  useEffect(() => {
    if (visible) {
      // Power-manager details are vendor-specific — fetch lazily on show.
      if (Platform.OS === 'android') {
        notifee.getPowerManagerInfo().then(setPowerInfo).catch(() => {});
      }
      animateIn();
    } else {
      if (internalVisible) {
        slideAnim.setValue(600);
        backdropAnim.setValue(0);
        setInternalVisible(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Auto-dismiss when user returns from Settings having unrestricted battery.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', async nextState => {
      if (nextState === 'active') {
        const stillOptimized = await notifee.isBatteryOptimizationEnabled().catch(() => true);
        if (!stillOptimized) {
          animateOut(onDismiss);
        }
      }
    });
    return () => sub.remove();
  }, [visible, animateOut, onDismiss]);

  const handleDismiss = useCallback(() => {
    animateOut(onDismiss);
  }, [animateOut, onDismiss]);

  const openBatterySettings = async () => {
    await notifee.openBatteryOptimizationSettings();
  };

  const openPowerManager = async () => {
    await notifee.openPowerManagerSettings();
  };

  const hasPowerManager = !!powerInfo?.activity;
  const brand = powerInfo?.manufacturer ?? '';

  if (!internalVisible && !visible) return null;

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss} />
      </Animated.View>

      <View style={styles.sheetAnchor} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom + 8, 28),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.iconCluster}>
            <View style={styles.iconGlow} />
            <View style={styles.iconRing}>
              <MaterialIcons name="battery-charging-full" size={30} color="#F9A825" />
            </View>
          </View>

          <Text style={styles.title}>Keep tracking all ride long</Text>
          <Text style={styles.body}>
            Android can stop background apps to save battery. Unrestricting Wayfarian means your route and distance keep recording even with the screen off.
          </Text>

          <View style={styles.steps}>
            <Step n={1} text='Tap "Unrestrict Battery" below' />
            <Step n={2} text="Scroll to Wayfarian in the list" />
            <Step n={3} text='Choose "Unrestricted" and go back' />
            {hasPowerManager && (
              <Step
                n={4}
                text={`Allow auto-start in${brand ? ` ${brand}` : ''} Power Manager too`}
              />
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={openBatterySettings}
              activeOpacity={0.82}
            >
              <MaterialIcons name="battery-saver" size={17} color="#fff" />
              <Text style={styles.primaryBtnLabel}>Unrestrict Battery</Text>
            </TouchableOpacity>

            {hasPowerManager && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={openPowerManager}
                activeOpacity={0.82}
              >
                <MaterialIcons name="settings" size={16} color="#E69000" />
                <Text style={styles.secondaryBtnLabel}>
                  {brand ? `${brand} Power Manager` : 'Power Manager Settings'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleDismiss}
              activeOpacity={0.55}
            >
              <Text style={styles.skipLabel}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ─── Step row ────────────────────────────────────────────────────────────────

/** Numbered instruction row used in the battery-unrestrict walkthrough. */
function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBubble}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 8, 4, 0.58)',
  },

  sheetAnchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  sheet: {
    backgroundColor: '#FDFAF4', // warm off-white — not cold #fff
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4CCBC',
    alignSelf: 'center',
    marginBottom: 24,
  },

  iconCluster: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: 64,
    height: 64,
  },
  iconGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(249, 168, 37, 0.12)',
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(249, 168, 37, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1A14',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: '#5C5449',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },

  steps: {
    marginBottom: 24,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  stepText: {
    fontSize: 14,
    color: '#3A3630',
    lineHeight: 22,
    flex: 1,
    fontWeight: '500',
  },

  actions: {
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F9A825',
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: '#F9A825',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E8D5A0',
    borderRadius: 16,
    paddingVertical: 13,
    backgroundColor: '#FFF8E8',
  },
  secondaryBtnLabel: {
    color: '#E69000',
    fontSize: 15,
    fontWeight: '600',
  },
  skipBtn: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  skipLabel: {
    fontSize: 14,
    color: '#8C8270',
    fontWeight: '500',
  },
});

export default BatteryOptimizationModal;
