import { detailRouteFor } from '../../v2/ids';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useV2UserData as useUserData } from '../../v2/legacyAdapters';
import { useSettings } from '../../contexts/SettingsContext';
import FloatingJourneyStatus from '../../components/FloatingJourneyStatus';
import Cut from '../../components/dw/Cut';
import ClipCard from '../../components/dw/ClipCard';
import Odometer from '../../components/dw/Odometer';
import Bar from '../../components/dw/Bar';
import Diamond from '../../components/dw/Diamond';
import Icon, { IconName } from '../../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../../constants/design';

// Same table the XP bar used before the redesign.
const LEVEL_THRESHOLDS = [
  0, 100, 400, 900, 1600, 2500, 3600, 4900, 6400, 8100,
  10000, 12100, 14400, 16900, 19600, 22500, 25600, 28900, 32400, 36100,
  40000, 44100, 48400, 52900, 57600, 62500, 67600, 72900, 78400, 84100,
  90000, 96100, 102400, 108900, 115600, 122500, 129600, 136900, 144400, 152100,
  160000, 168100, 176400, 184900, 193600, 202500, 211600, 220900, 230400, 240100,
];

const BADGE_ICONS: IconName[] = ['moon', 'route', 'bolt', 'sun'];

const formatTime = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'W';

export default function HomeScreen(): React.JSX.Element {
  const t = useDW();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const { dashboardData, achievements, loading, refreshData } = useUserData();
  const { convertDistance, convertSpeed } = useSettings();
  const { t: tr } = useTranslation();
  const streak = (dashboardData as any)?.streak?.current ?? 0;

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  if (!isAuthenticated) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ fontFamily: F.bold, color: t.ink }}>{tr('home.pleaseLogin')}</Text>
      </View>
    );
  }

  const u = dashboardData?.user;
  const name = u?.displayName || user?.displayName || 'Rider';
  const km = Math.max(0, u?.totalDistance || 0);
  const secs = u?.totalTime || 0;
  const xp = u?.xp || 0;
  const level = u?.level || 1;
  const prev = LEVEL_THRESHOLDS[level - 1] || 0;
  const next = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const pct = next > prev ? (xp - prev) / (next - prev) : 1;

  const tenths = Math.round(km * 10);
  const whole = String(Math.floor(tenths / 10)).padStart(5, '0');
  const tenth = String(tenths % 10);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const avg = km / Math.max(secs / 3600, 0.1);
  const totals = [
    { label: 'On road', value: formatTime(secs), unit: '' },
    { label: 'Average', value: String(convertSpeed(avg)), unit: '' },
    { label: 'Top', value: String(convertSpeed(u?.topSpeed || 0)), unit: '' },
  ];

  const unlocked = (a: any) =>
    a.unlocked === true || (Array.isArray(a.tiers) && a.tiers.some((x: any) => x.unlocked === true));
  const done = achievements.filter(unlocked);
  const todo = achievements.filter((a) => !unlocked(a));
  const badges = [...done, ...todo].slice(0, 4).map((a: any, i) => {
    const tier = Array.isArray(a.tiers) ? a.tiers.filter((x: any) => x.unlocked).length : 0;
    return {
      key: a.id as string,
      name: a.name as string,
      icon: BADGE_ICONS[i % BADGE_ICONS.length],
      on: unlocked(a),
      tier: unlocked(a) ? `Tier ${tier || 1}` : 'Locked',
    };
  });

  const rides = (dashboardData?.recentJourneys || []).slice(0, 3);

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <FloatingJourneyStatus homeOnly />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshData} tintColor={AMBER} />}
      >
        <View style={{ height: 372 - 0 }}>
          <Cut />
          <View style={[styles.header, { top: Math.max(56, insets.top + 8) }]}>
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              style={styles.avatar}
            >
              {u?.photoURL || user?.photoURL ? (
                <Image source={{ uri: (u?.photoURL || user?.photoURL) as string }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initials(name)}</Text>
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.greet}>{greeting}</Text>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={styles.iconBtn}
            >
              <Icon name="settings" size={20} color={INK} />
            </Pressable>
          </View>

          <View style={[styles.odo, { top: Math.max(56, insets.top + 8) + 72 }]}>
            <Text style={styles.eyebrow}>Odometer</Text>
            <Odometer whole={whole} tenth={tenth} />
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>Level {level}</Text>
            </View>
          </View>

          <ClipCard color={t.panel} style={[styles.totals, shadow(t, 12)]}>
            {totals.map((s, i) => (
              <View
                key={s.label}
                style={[styles.total, i > 0 && { borderLeftWidth: 1, borderLeftColor: t.panelLine }]}
              >
                <Text style={[styles.totalLabel, { color: t.panelMuted }]}>{s.label}</Text>
                <Text style={[styles.totalValue, { color: t.panelText }]} numberOfLines={1}>
                  {loading ? '–' : s.value}
                </Text>
              </View>
            ))}
          </ClipCard>
        </View>

        <View style={styles.block}>
          <View style={styles.rowBetween}>
            <Pressable onPress={() => router.push('/quests')} accessibilityRole="button">
              <Text style={[styles.xpTitle, { color: t.ink }]}>
                {Math.max(0, next - xp).toLocaleString()} XP to Level {level + 1}
              </Text>
            </Pressable>
            {streak > 0 && (
              <View style={styles.streak}>
                <Icon name="flame" size={16} color="#E2711D" stroke={2} />
                <Text style={[styles.streakText, { color: t.ink2 }]}>{streak}-day streak</Text>
              </View>
            )}
          </View>
          <View style={{ marginTop: 10 }}>
            <Bar t={t} pct={pct} />
          </View>
          <View style={[styles.rowBetween, { marginTop: 10 }]}>
            <Text style={[styles.mono, { color: t.ink2 }]}>{xp.toLocaleString()} XP</Text>
            <Text style={[styles.mono, { color: t.ink2 }]}>{next.toLocaleString()}</Text>
          </View>
        </View>

        <View style={[styles.block, { marginTop: 28 }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.h2, { color: t.ink }]}>Badges</Text>
            <Pressable onPress={() => router.push('/badges')} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.link, { color: t.ink2 }]}>
                {done.length} of {achievements.length}
              </Text>
            </Pressable>
          </View>
        </View>
        {badges.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badges}>
            {badges.map((b) => (
              <Diamond key={b.key} t={t} icon={b.icon} name={b.name} tier={b.tier} on={b.on} />
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.empty, { color: t.ink2 }]}>{tr('home.noAchievements')}</Text>
        )}

        <View style={[styles.block, { marginTop: 24 }]}>
          <View style={[styles.rowBetween, { marginBottom: 6 }]}>
            <Text style={[styles.h2, { color: t.ink }]}>Recent rides</Text>
            {rides.length > 0 && (
              <Pressable onPress={() => router.push('/PastJourneysScreen')} hitSlop={10}>
                <Text style={[styles.link, { color: t.ink2 }]}>See all</Text>
              </Pressable>
            )}
          </View>
          {rides.length === 0 && (
            <Text style={[styles.empty, { color: t.ink2, paddingHorizontal: 0 }]}>{tr('home.noJourneys')}</Text>
          )}
          {rides.map((j: any, i: number) => {
            const cover = j.coverPhotoUrl || j.photos?.[0]?.thumbnailUrl || j.photos?.[0]?.imageUrl;
            const day = j.startTime ? new Date(j.startTime).toLocaleDateString(undefined, { weekday: 'short' }) : '';
            return (
              <Pressable
                key={j.id}
                onPress={() =>
                  j.isV2
                    ? router.push(detailRouteFor(j.id) as never)
                    : router.push(`/journey-detail?journeyId=${j.id}`)
                }
                style={[styles.ride, { borderTopColor: t.line }]}
              >
                <View style={[styles.thumb, { backgroundColor: t.surface2 }]}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.thumbImg} />
                  ) : (
                    <Icon name="route" size={22} color={AMBER} stroke={2.4} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rideTitle, { color: t.ink }]} numberOfLines={1}>
                    {j.title || `Journey ${i + 1}`}
                  </Text>
                  <Text style={[styles.mono, { color: t.ink2 }]}>
                    {convertDistance(j.totalDistance || 0)} · {formatTime(j.totalTime || 0)}
                  </Text>
                </View>
                <Text style={[styles.day, { color: t.ink2 }]}>{day}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 44, height: 44 },
  avatarText: { fontFamily: F.extra, fontSize: 15, color: AMBER, letterSpacing: 0.3 },
  greet: { fontFamily: F.regular, fontSize: 13, color: 'rgba(26,24,20,0.72)' },
  name: { fontFamily: F.extra, fontSize: 18, color: INK, letterSpacing: -0.2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,253,248,0.5)', alignItems: 'center', justifyContent: 'center' },
  odo: { position: 'absolute', left: 20, gap: 10 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(26,24,20,0.72)' },
  levelPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,253,248,0.5)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  levelPillText: { fontFamily: F.bold, fontSize: 12, color: INK },
  totals: { position: 'absolute', left: 16, right: 16, bottom: -18, height: 92, flexDirection: 'row', alignItems: 'center' },
  total: { flex: 1, paddingHorizontal: 18, gap: 6 },
  totalLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase' },
  totalValue: { fontFamily: F.monoBold, fontSize: 20 },
  block: { paddingHorizontal: 20, marginTop: 36 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  xpTitle: { fontFamily: F.extra, fontSize: 15 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  streakText: { fontFamily: F.bold, fontSize: 13 },
  mono: { fontFamily: F.monoSemi, fontSize: 12 },
  h2: { fontFamily: F.extra, fontSize: 20, letterSpacing: -0.2 },
  link: { fontFamily: F.bold, fontSize: 13 },
  badges: { paddingHorizontal: 20, gap: 8, paddingTop: 12 },
  empty: { fontFamily: F.regular, fontSize: 14, paddingHorizontal: 20, paddingTop: 12 },
  ride: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderTopWidth: 1 },
  thumb: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: 52, height: 52 },
  rideTitle: { fontFamily: F.extra, fontSize: 16 },
  day: { fontFamily: F.bold, fontSize: 12 },
});
