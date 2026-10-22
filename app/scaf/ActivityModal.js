import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ClipCard from '../components/dw/ClipCard';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';

/**
 * "New ride" sheet opened from the centre tab button.
 * Rendered as an in-tree overlay so the tab bar (and its close button) stays above it.
 */
const ActivityModal = ({ visible, onClose }) => {
  const t = useDW();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, anim]);

  if (!mounted) return null;

  const go = (path, params) => {
    onClose();
    router.push(params ? { pathname: path, params } : path);
  };
  const join = () => {
    const c = code.trim();
    if (!c) return;
    go('/group-ride', { code: c });
  };

  const sheetStyle = {
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim, backgroundColor: 'rgba(17,16,14,0.55)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close ride menu" />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          shadow({ ...t, shadowColor: '#000', shadowOpacity: 0.4 }, 20),
          { backgroundColor: t.surface, bottom: 104 + Math.max(0, insets.bottom - 20) },
          sheetStyle,
        ]}
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: t.ink }]}>New ride</Text>
          <Text style={[styles.gps, { color: t.ink2 }]}>GPS ready</Text>
        </View>

        <View style={styles.tiles}>
          <Pressable style={{ flex: 1.25 }} onPress={() => go('/ride')} accessibilityRole="button">
            <ClipCard color={AMBER} corner={20} radius={20} style={styles.tile}>
              <Icon name="nav" size={28} color={INK} fill />
              <View>
                <Text style={[styles.tileTitle, { color: INK }]}>Solo ride</Text>
                <Text style={[styles.tileSub, { color: 'rgba(26,24,20,0.72)' }]}>Just you and the road</Text>
              </View>
            </ClipCard>
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => go('/group-ride')} accessibilityRole="button">
            <View style={[styles.tile, { backgroundColor: t.panel, borderRadius: 20 }]}>
              <View style={{ flexDirection: 'row' }}>
                {[
                  ['TO', AMBER, INK],
                  ['AB', '#E8E2D4', INK],
                  ['+3', '#6E675B', '#F4F1E9'],
                ].map(([l, bg, fg], i) => (
                  <View
                    key={l}
                    style={[styles.av, { backgroundColor: bg, borderColor: t.panel, marginLeft: i ? -8 : 0 }]}
                  >
                    <Text style={[styles.avText, { color: fg }]}>{l}</Text>
                  </View>
                ))}
              </View>
              <View>
                <Text style={[styles.tileTitle, { color: t.panelText }]}>Group ride</Text>
                <Text style={[styles.tileSub, { color: t.panelMuted }]}>Ride with your crew</Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[styles.codeLabel, { color: t.ink2 }]}>Join a group ride with a code</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="WF-7K2Q"
              placeholderTextColor={t.ink2}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, { borderColor: t.line2, backgroundColor: t.bg, color: t.ink }]}
            />
            <Pressable onPress={join} style={({ pressed }) => [styles.joinBtn, { backgroundColor: t.ink, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={[styles.joinText, { color: t.bg }]}>Join</Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Pressable
            onPress={() => go('/future-rides')}
            style={({ pressed }) => [styles.row, { borderTopColor: t.line, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: t.surface2 }]}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Rect x={4} y={5} width={16} height={15} rx={2} stroke={t.ink} strokeWidth={1.9} />
                <Path d="M4 10h16M9 3v4M15 3v4" stroke={t.ink} strokeWidth={1.9} strokeLinecap="round" />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: t.ink }]}>Plan for later</Text>
              <Text style={[styles.rowSub, { color: t.ink2 }]}>Set a date, get a reminder</Text>
            </View>
            <Icon name="chevron" size={18} color={t.ink2} stroke={2} />
          </Pressable>
          <View style={[styles.row, { borderTopColor: t.line }]} accessibilityState={{ disabled: true }}>
            <View style={[styles.rowIcon, { backgroundColor: t.surface2 }]}>
              <Icon name="trophy" size={18} color={t.ink2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: t.ink2 }]}>Challenges</Text>
              <Text style={[styles.rowSub, { color: t.ink2 }]}>Race friends for badges</Text>
            </View>
            <Text style={[styles.soon, { color: t.ink2, borderColor: t.line2 }]}>SOON</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 16, right: 16, borderRadius: 28, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 10, gap: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.44 },
  gps: { fontFamily: F.monoSemi, fontSize: 12 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { height: 132, padding: 16, justifyContent: 'space-between' },
  tileTitle: { fontFamily: F.black, fontSize: 18, letterSpacing: -0.18 },
  tileSub: { fontFamily: F.semi, fontSize: 13 },
  av: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avText: { fontFamily: F.black, fontSize: 10 },
  codeLabel: { fontFamily: F.bold, fontSize: 12 },
  input: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, fontFamily: F.monoBold, fontSize: 16, letterSpacing: 1.9 },
  joinBtn: { height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontFamily: F.extra, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, borderTopWidth: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.extra, fontSize: 15 },
  rowSub: { fontFamily: F.regular, fontSize: 12 },
  soon: { fontFamily: F.extra, fontSize: 11, letterSpacing: 0.9, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 2 },
});

export default ActivityModal;
