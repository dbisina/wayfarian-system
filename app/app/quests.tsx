// app/app/quests.tsx — weekly quests, derived client-side from the journey history and streak API.

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuestWeek, useV2Rides, useV2Summary } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { useSettings } from '../contexts/SettingsContext';
import ClipCard from '../components/dw/ClipCard';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../constants/design';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const weekStart = (now: Date) => {
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
};

export default function QuestsScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { convertDistance } = useSettings();
  const qc = useQueryClient();
  const rides = useV2Rides();
  const summary = useV2Summary();
  const questWeek = useQuestWeek();
  const [opening, setOpening] = useState(false);

  // Quests count rides from the ride engine. Load older pages until they reach the start of the month.
  const monthStart = useMemo(() => { const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0); return m.getTime(); }, []);
  const loaded = rides.data?.pages.flatMap((p: any) => p.items) ?? [];
  const oldest = loaded.length ? new Date(loaded[loaded.length - 1].startedAt).getTime() : Infinity;
  useEffect(() => {
    if (rides.hasNextPage && !rides.isFetchingNextPage && oldest > monthStart && (rides.data?.pages.length ?? 0) < 6) rides.fetchNextPage();
  }, [rides, oldest, monthStart]);

  const journeys = useMemo(
    () => loaded
      .filter((r: any) => r.status === 'FINALIZED' && r.distanceM >= 100)
      .map((r: any) => ({ startTime: r.startedAt, totalDistance: r.distanceM / 1000, group: !!r.groupRideId })),
    [loaded]
  );
  const streak = { current: summary.data?.streak?.current ?? 0, best: summary.data?.streak?.longest ?? summary.data?.streak?.current ?? 0 };

  const openChest = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await getRuntime().client.openQuestChest();
      await Promise.all([questWeek.refetch(), qc.invalidateQueries({ queryKey: ['u'] })]);
    } catch (e: any) {
      Alert.alert('Could not open the chest', e?.message || 'Try again');
    } finally {
      setOpening(false);
    }
  };

  const now = new Date();
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const week = journeys.filter((j) => {
    const t = new Date(j.startTime);
    return t >= start && t < end;
  });
  const dayHas = new Set(week.map((j) => (new Date(j.startTime).getDay() + 6) % 7));
  const todayIdx = (now.getDay() + 6) % 7;
  const weekKm = week.reduce((s, j) => s + (j.totalDistance || 0), 0);

  const monthKm = journeys
    .filter((j) => {
      const t = new Date(j.startTime);
      return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
    })
    .reduce((s, j) => s + (j.totalDistance || 0), 0);
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  const msLeft = end.getTime() - now.getTime();
  const resets = `${Math.floor(msLeft / 86400000)}d ${Math.floor((msLeft % 86400000) / 3600000)}h`;

  const quests = [
    { title: 'Night ride after 8pm', cur: week.some((j) => new Date(j.startTime).getHours() >= 20) ? 1 : 0, goal: 1, label: '' },
    { title: 'Ride 150 km', cur: weekKm, goal: 150, label: 'km' },
    { title: 'Ride on 3 different days', cur: dayHas.size, goal: 3, label: '' },
    { title: 'Join a group ride', cur: week.filter((j) => !!j.group).length, goal: 1, label: '' },
  ];
  const doneCount = quests.filter((q) => q.cur >= q.goal).length;
  const qw = questWeek.data;
  const xp = qw?.xp ?? 0;
  const xpTarget = qw?.target ?? 800;
  const heroPct = Math.min(1, xp / xpTarget);

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingBottom: 60, gap: 22 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={[styles.round, { backgroundColor: d.surface }]}
          >
            <Icon name="back" size={20} color={d.ink} stroke={2} />
          </TouchableOpacity>
          <Text style={[styles.h1, { color: d.ink }]}>Quests</Text>
          <View style={[styles.reset, { backgroundColor: d.surface2 }]}>
            <Text style={[styles.resetText, { color: d.ink }]}>Resets {resets}</Text>
          </View>
        </View>

        <ClipCard color={AMBER} corner={24} radius={26} style={styles.hero}>
          <View style={{ padding: 20, gap: 8 }}>
            <Text style={styles.eyebrow}>Earned this week</Text>
            <Text style={styles.heroNum}>
              {xp.toLocaleString('en-US')}
              <Text style={styles.heroUnit}>  / {xpTarget.toLocaleString('en-US')} XP</Text>
            </Text>
            <View style={styles.heroTrack}>
              <View style={{ width: `${heroPct * 100}%`, height: 8, backgroundColor: INK }} />
            </View>
            {qw?.chest.unlocked && !qw.chest.claimed ? (
              <TouchableOpacity onPress={openChest} disabled={opening} accessibilityRole="button" style={[styles.chestBtn, { opacity: opening ? 0.6 : 1 }]}>
                <Text style={styles.chestBtnText}>Open the weekly chest · +{qw.chest.rewardXp} XP</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.heroNote}>
                {qw?.chest.claimed ? `Chest opened this week · ${doneCount} of ${quests.length} quests done` : `${qw ? qw.xpToGo.toLocaleString('en-US') : '–'} XP more unlocks the weekly chest`}
              </Text>
            )}
          </View>
        </ClipCard>

        <View style={styles.block}>
          <View style={styles.rowBetween}>
            <View style={styles.streakTitle}>
              <Icon name="flame" size={18} color="#E2711D" stroke={2} />
              <Text style={[styles.streakText, { color: d.ink }]}>{streak.current}-day streak</Text>
            </View>
            <Text style={[styles.small, { color: d.ink2 }]}>Best: {streak.best} days</Text>
          </View>
          <View style={styles.days}>
            {DAY_LABELS.map((l, i) => {
              const done = dayHas.has(i);
              const today = i === todayIdx && !done;
              const later = i > todayIdx;
              return (
                <View
                  key={i}
                  style={styles.day}
                  accessible
                  accessibilityLabel={`${DAY_NAMES[i]}${done ? ', ridden' : today ? ', today, not ridden yet' : ''}`}
                >
                  <View style={styles.dayWrap}>
                    <View
                      style={[
                        styles.dayDiamond,
                        done && { backgroundColor: AMBER },
                        today && { borderWidth: 2, borderStyle: 'dashed', borderColor: AMBER },
                        !done && !today && later && { backgroundColor: d.dark ? 'rgba(242,238,229,0.12)' : 'rgba(26,24,20,0.1)' },
                        !done && !today && !later && { backgroundColor: d.dark ? 'rgba(242,238,229,0.12)' : 'rgba(26,24,20,0.1)' },
                      ]}
                    />
                  </View>
                  <Text style={[styles.dayLabel, { color: later ? d.ink2 : d.ink }]}>{l}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.small, { color: d.ink2, fontFamily: F.bold, fontSize: 13 }]}>
            {dayHas.has(todayIdx) ? 'Nice, you rode today.' : 'Ride today to keep it going.'}
          </Text>
        </View>

        <ClipCard color={d.panel} corner={18} radius={20} style={styles.challenge}>
          <View style={styles.challengeRow}>
            <View style={styles.challengeIcon}>
              <View style={styles.challengeDiamond} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.rowBetween}>
                <Text style={[styles.challengeTitle, { color: d.panelText }]}>{monthName} Thousand</Text>
                <Text style={[styles.mono, { color: d.panelMuted }]}>{Math.round(monthKm)} / 1,000 km</Text>
              </View>
              <View style={styles.challengeTrack}>
                <View style={{ width: `${Math.min(1, monthKm / 1000) * 100}%`, height: 5, backgroundColor: AMBER }} />
              </View>
              <Text style={[styles.small, { color: d.panelMuted }]}>Limited badge · {daysLeft} days left</Text>
            </View>
          </View>
        </ClipCard>

        <View style={styles.block}>
          {quests.map((q) => {
            const pct = Math.min(1, q.cur / q.goal);
            const done = q.cur >= q.goal;
            return (
              <View key={q.title} style={[styles.quest, { borderTopColor: d.line }]}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.questTitle, { color: d.ink }]}>{q.title}</Text>
                    <Text style={[styles.mono, { color: d.ink2 }]}>
                      {q.label ? `${Math.round(q.cur)} / ${q.goal} ${q.label}` : `${Math.min(q.cur, q.goal)} / ${q.goal}`}
                    </Text>
                  </View>
                  <View style={[styles.questTrack, { backgroundColor: d.surface2 }]}>
                    <View style={{ width: `${pct * 100}%`, height: 5, backgroundColor: AMBER }} />
                  </View>
                </View>
                {done && (
                  <View style={styles.doneTag}>
                    <Text style={styles.doneText}>Done</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 20 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { flex: 1, fontFamily: F.black, fontSize: 30, letterSpacing: -0.6 },
  reset: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  resetText: { fontFamily: F.monoBold, fontSize: 12 },
  hero: { marginHorizontal: 16 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(26,24,20,0.72)' },
  heroNum: { fontFamily: F.monoBold, fontSize: 48, lineHeight: 62, letterSpacing: -1.4, color: INK },
  heroUnit: { fontSize: 16, letterSpacing: 0 },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(26,24,20,0.15)', overflow: 'hidden' },
  chestBtn: { marginTop: 4, height: 46, borderRadius: 23, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  chestBtnText: { fontFamily: F.black, fontSize: 14, color: AMBER },
  heroNote: { fontFamily: F.bold, fontSize: 13, color: 'rgba(26,24,20,0.75)' },
  block: { paddingHorizontal: 20, gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  streakTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakText: { fontFamily: F.black, fontSize: 16 },
  small: { fontFamily: F.bold, fontSize: 12 },
  days: { flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: 8 },
  dayWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayDiamond: { width: 26, height: 26, borderRadius: 7, transform: [{ rotate: '45deg' }] },
  dayLabel: { fontFamily: F.extra, fontSize: 12 },
  challenge: { marginHorizontal: 16 },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, paddingHorizontal: 16 },
  challengeIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  challengeDiamond: { width: 36, height: 36, borderRadius: 10, transform: [{ rotate: '45deg' }], borderWidth: 2, borderStyle: 'dashed', borderColor: AMBER },
  challengeTitle: { fontFamily: F.black, fontSize: 15 },
  mono: { fontFamily: F.monoBold, fontSize: 12 },
  challengeTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(244,241,233,0.14)', overflow: 'hidden' },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, borderTopWidth: 1 },
  questTitle: { fontFamily: F.extra, fontSize: 15, flexShrink: 1 },
  questTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  doneTag: { backgroundColor: AMBER, borderRadius: 12, paddingHorizontal: 12, height: 32, justifyContent: 'center' },
  doneText: { fontFamily: F.black, fontSize: 13, color: INK },
});
