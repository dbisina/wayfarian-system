// app/app/level-up.tsx — shown when a ride finishes with a new level.
// Params: level, prevLevel, xp (this ride), km, badge (optional new badge name)

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import ClipCard from '../components/dw/ClipCard';
import Icon from '../components/dw/Icon';
import { AMBER, CREAM, F, INK } from '../constants/design';

export default function LevelUpScreen() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ level?: string; prevLevel?: string; xp?: string; km?: string; badge?: string }>();
  const level = Math.max(1, parseInt(p.level || '1', 10));
  const prev = p.prevLevel ? parseInt(p.prevLevel, 10) : level - 1;
  const xp = parseInt(p.xp || '0', 10);
  const km = parseFloat(p.km || '0');
  const digits = String(level).split('');

  const rows = [
    km > 0 ? { label: `Distance · ${km.toFixed(0)} km`, xp: `+${Math.round(km * 2)}` } : null,
    xp > 0 && km > 0 ? { label: 'Bonuses', xp: `+${Math.max(0, xp - Math.round(km * 2))}` } : null,
  ].filter(Boolean) as { label: string; xp: string }[];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        {[260, 420, 580].map((y) => (
          <Line key={y} x1={0} y1={y} x2={390} y2={y - 220} stroke={INK} strokeOpacity={0.14} strokeWidth={2} strokeDasharray="16 12" />
        ))}
      </Svg>

      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[styles.close, { top: Math.max(56, insets.top + 8) }]}
      >
        <Icon name="close" size={20} color={INK} stroke={2.4} />
      </TouchableOpacity>

      <View style={[styles.hero, { top: Math.max(118, insets.top + 70) }]}>
        <Text style={styles.eyebrow}>Level up</Text>
        <View style={styles.digits}>
          {digits.map((dg, i) => (
            <View key={i} style={styles.tile}>
              <Text style={[styles.tileText, { color: i === digits.length - 1 ? AMBER : CREAM }]}>{dg}</Text>
            </View>
          ))}
          <View style={styles.was}>
            <Text style={styles.wasLabel}>was</Text>
            <Text style={styles.wasValue}>{prev}</Text>
          </View>
        </View>
        <Text style={styles.line}>
          {km > 0 ? `${km.toFixed(0)} km in one go. ` : ''}Keep riding to reach level {level + 1}.
        </Text>
      </View>

      {(rows.length > 0 || xp > 0) && (
        <ClipCard color={INK} corner={20} radius={22} style={[styles.xp, { top: Math.max(432, insets.top + 384) }]}>
          <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 }}>
            {rows.map((r) => (
              <View key={r.label} style={styles.xpRow}>
                <Text style={styles.xpLabel}>{r.label}</Text>
                <Text style={styles.xpVal}>{r.xp}</Text>
              </View>
            ))}
            <View style={[styles.xpRow, { borderBottomWidth: 0, paddingTop: 14 }]}>
              <Text style={styles.xpTotalLabel}>This ride</Text>
              <Text style={styles.xpTotal}>+{xp} XP</Text>
            </View>
          </View>
        </ClipCard>
      )}

      {p.badge ? (
        <TouchableOpacity onPress={() => router.push('/badges')} accessibilityRole="button" style={styles.badge}>
          <View style={styles.badgeIcon}>
            <View style={styles.badgeDiamond}>
              <View style={{ transform: [{ rotate: '-45deg' }] }}>
                <Icon name="route" size={15} color={AMBER} stroke={2.2} />
              </View>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.badgeSmall}>New badge</Text>
            <Text style={styles.badgeName}>{p.badge}</Text>
          </View>
          <Icon name="chevron" size={18} color={INK} stroke={2.2} />
        </TouchableOpacity>
      ) : null}

      <View style={[styles.actions, { bottom: Math.max(34, insets.bottom + 14) }]}>
        <TouchableOpacity
          onPress={() => Share.share({ message: `I just hit level ${level} on Wayfarian.` })}
          accessibilityRole="button"
          style={[styles.btn, { flex: 1, borderWidth: 2, borderColor: INK }]}
        >
          <Text style={[styles.btnText, { color: INK }]}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          style={[styles.btn, { flex: 1.6, backgroundColor: INK }]}
        >
          <Text style={[styles.btnText, { color: AMBER }]}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AMBER },
  close: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,253,248,0.5)', alignItems: 'center', justifyContent: 'center' },
  hero: { position: 'absolute', left: 24, right: 24, gap: 14 },
  eyebrow: { fontFamily: F.black, fontSize: 12, letterSpacing: 2.4, textTransform: 'uppercase', color: INK },
  digits: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  tile: { width: 96, height: 132, borderRadius: 16, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileText: { fontFamily: F.monoBold, fontSize: 96, lineHeight: 112 },
  was: { marginLeft: 8, paddingBottom: 8 },
  wasLabel: { fontFamily: F.bold, fontSize: 13, color: 'rgba(26,24,20,0.72)' },
  wasValue: { fontFamily: F.monoBold, fontSize: 22, color: INK },
  line: { fontFamily: F.extra, fontSize: 18, lineHeight: 24, color: INK, maxWidth: 300 },
  xp: { position: 'absolute', left: 16, right: 16 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(244,241,233,0.1)' },
  xpLabel: { fontFamily: F.bold, fontSize: 14, color: '#C9C2B3' },
  xpVal: { fontFamily: F.monoBold, fontSize: 15, color: CREAM },
  xpTotalLabel: { fontFamily: F.black, fontSize: 15, color: CREAM },
  xpTotal: { fontFamily: F.monoBold, fontSize: 26, color: AMBER },
  badge: { position: 'absolute', left: 16, right: 16, bottom: 130, height: 64, borderRadius: 18, backgroundColor: 'rgba(255,253,248,0.55)', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  badgeIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badgeDiamond: { width: 28, height: 28, borderRadius: 8, backgroundColor: INK, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  badgeSmall: { fontFamily: F.bold, fontSize: 12, color: 'rgba(26,24,20,0.72)' },
  badgeName: { fontFamily: F.black, fontSize: 16, color: INK },
  actions: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 10 },
  btn: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.black, fontSize: 15 },
});
