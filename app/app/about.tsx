// app/app/about.tsx — About the developers: how to reach them.

import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/dw/Icon';
import { F, INK, AMBER, useDW } from '../constants/design';

const EMAILS = ['contact.deusx@gmail.com', 'danielbisina.t@gmail.com'];
const PHONE = '+2347077213386';
const PHONE_SHOWN = '+234 707 721 3386';
const INSTAGRAM = 'tariwei_bisina';

const open = async (url: string, fallback?: string) => {
  try {
    await Linking.openURL(url);
  } catch {
    if (fallback) {
      try { await Linking.openURL(fallback); return; } catch { /* fall through */ }
    }
    Alert.alert('Could not open that', 'Nothing on this phone can open it.');
  }
};

type Glyph = 'mail' | 'phone' | 'insta';

function GlyphIcon({ kind, color }: { kind: Glyph; color: string }) {
  const p = { stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      {kind === 'mail' && (<><Rect x={3.5} y={5.5} width={17} height={13} rx={2.5} {...p} /><Path d="m4 7.5 8 6 8-6" {...p} /></>)}
      {kind === 'phone' && <Path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 4.5 6a2 2 0 0 1 2-2z" {...p} />}
      {kind === 'insta' && (<><Rect x={4} y={4} width={16} height={16} rx={5} {...p} /><Circle cx={12} cy={12} r={3.6} {...p} /><Path d="M16.6 7.4h.01" {...p} /></>)}
    </Svg>
  );
}

export default function AboutScreen() {
  const d = useDW();
  const rows: { glyph: Glyph; label: string; value: string; onPress: () => void }[] = [
    ...EMAILS.map((e) => ({ glyph: 'mail' as const, label: 'Email', value: e, onPress: () => open(`mailto:${e}`) })),
    { glyph: 'phone', label: 'Phone', value: PHONE_SHOWN, onPress: () => open(`tel:${PHONE}`) },
    {
      glyph: 'insta',
      label: 'Instagram',
      value: `@${INSTAGRAM}`,
      onPress: () => open(`instagram://user?username=${INSTAGRAM}`, `https://instagram.com/${INSTAGRAM}`),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScreenHeader title="About the developers" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Wayfarian</Text>
          <Text style={styles.heroTitle}>Built by riders, for riders</Text>
          <Text style={styles.heroSub}>Questions, ideas or a ride that went wrong? Reach the developers here.</Text>
        </View>

        <View style={[styles.list, { backgroundColor: d.surface }]}>
          {rows.map((r, i) => (
            <TouchableOpacity
              key={r.value}
              onPress={r.onPress}
              accessibilityRole="link"
              accessibilityLabel={`${r.label}: ${r.value}`}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: d.line }]}
            >
              <View style={[styles.tile, { backgroundColor: d.surface2 }]}><GlyphIcon kind={r.glyph} color={d.ink} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: d.ink2 }]}>{r.label}</Text>
                <Text style={[styles.value, { color: d.ink }]} numberOfLines={1} selectable>{r.value}</Text>
              </View>
              <Icon name="chevron" size={16} color={d.ink2} stroke={2} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/bug-report')}
          accessibilityRole="button"
          style={[styles.bug, { backgroundColor: d.surface }]}
        >
          <Icon name="help" size={18} color={d.ink} stroke={2} />
          <Text style={[styles.bugText, { color: d.ink }]}>Found a bug? Report it in the app</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: d.ink2 }]}>Wayfarian {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 16, paddingBottom: 60 },
  hero: { borderRadius: 26, backgroundColor: AMBER, padding: 20, gap: 6 },
  heroEyebrow: { fontFamily: F.black, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: INK },
  heroTitle: { fontFamily: F.black, fontSize: 24, letterSpacing: -0.5, color: INK },
  heroSub: { fontFamily: F.bold, fontSize: 14, lineHeight: 19, color: 'rgba(26,24,20,0.78)' },
  list: { borderRadius: 24, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: F.bold, fontSize: 12 },
  value: { fontFamily: F.extra, fontSize: 15 },
  bug: { height: 56, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  bugText: { fontFamily: F.extra, fontSize: 14 },
  version: { fontFamily: F.mono, fontSize: 12, textAlign: 'center' },
});
