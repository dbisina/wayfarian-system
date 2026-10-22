import { router } from 'expo-router';
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useV2LeaderboardView as useLeaderboard } from '../../v2/legacyAdapters';
import { useTranslation } from 'react-i18next';
import { SkeletonLine } from '../../components/Skeleton';
import ClipCard from '../../components/dw/ClipCard';
import Cut from '../../components/dw/Cut';
import { AMBER, F, INK, useDW } from '../../constants/design';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

export default function LeaderboardScreen(): React.JSX.Element {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { friendsData, globalData, loading, error, refreshLeaderboard } = useLeaderboard();
  const { convertDistance } = useSettings();
  const [activeTab, setActiveTab] = useState<'friends' | 'global'>('global');
  const sortBy = 'totalDistance' as const;

  const currentData = activeTab === 'friends' ? friendsData : globalData;
  const onRefresh = async () => {
    await refreshLeaderboard(activeTab, sortBy);
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.center, { backgroundColor: d.bg }]}>
        <Text style={{ fontFamily: F.bold, color: d.ink }}>{t('leaderboard.loginToView')}</Text>
      </View>
    );
  }

  const users: any[] = currentData?.users || [];
  const me: any = currentData?.currentUser;
  const top = users.slice(0, 3);
  const rest = users.slice(3);
  const slots = [
    { x: 0, y: 0 },
    { x: 184, y: 48 },
    { x: 0, y: 124 },
  ];
  const nameOf = (u: any) => u.displayName || u.name || t('leaderboard.user');
  const ccOf = (u: any) => (u.countryCode ? String(u.countryCode).toUpperCase() : '');
  const km = (u: any) => convertDistance(u.totalDistance || 0);
  const topInk = d.dark ? AMBER : '#B26A00';
  const top0 = Math.max(56, insets.top + 8);

  const openRider = (u: any) => {
    const id = u.userId || u.id;
    if (id) router.push({ pathname: '/rider-profile', params: { riderId: id } } as never);
  };

  const setTab = (tab: 'friends' | 'global') => {
    setActiveTab(tab);
    refreshLeaderboard(tab, sortBy);
  };

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 220 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={AMBER} />}
      >
        <View style={{ height: 250 }}>
          <Cut height={250} />
          <View style={[styles.header, { top: top0 }]}>
            <Text style={styles.h1}>{t('leaderboard.title')}</Text>
            <View style={styles.seg} accessibilityRole="tablist">
              {(['global', 'friends'] as const).map((tab) => {
                const on = activeTab === tab;
                return (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setTab(tab)}
                    style={[styles.segItem, on && { backgroundColor: INK }]}
                  >
                    <Text style={{ fontFamily: on ? F.extra : F.bold, fontSize: 13, color: on ? AMBER : INK }}>
                      {tab === 'global' ? t('leaderboard.globalTab') : t('leaderboard.friendsTab')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.eyebrow}>Distance</Text>
          </View>
        </View>

        {loading && !currentData ? (
          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonLine key={i} width={'100%' as any} height={40} />
            ))}
          </View>
        ) : error ? (
          <View style={styles.msg}>
            <Text style={[styles.msgText, { color: d.ink2 }]}>{error}</Text>
            <Pressable onPress={onRefresh} style={styles.retry}>
              <Text style={styles.retryText}>{t('leaderboard.retry')}</Text>
            </Pressable>
          </View>
        ) : users.length === 0 ? (
          <View style={styles.msg}>
            <Text style={[styles.msgText, { color: d.ink }]}>
              {activeTab === 'friends' ? t('leaderboard.noFriends') : t('leaderboard.noGlobal')}
            </Text>
            <Text style={[styles.msgText, { color: d.ink2, fontFamily: F.regular, fontSize: 14 }]}>
              {activeTab === 'friends' ? t('leaderboard.joinFriends') : t('leaderboard.beFirst')}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.podium}>
              {top.map((u, i) => {
                const first = i === 0;
                return (
                  <Pressable key={u.id || i} onPress={() => openRider(u)} accessibilityRole="button" accessibilityLabel={`${nameOf(u)}, rank ${i + 1}`} style={[styles.podiumCell, { left: slots[i].x, top: slots[i].y }]}>
                    <View style={[styles.podiumTop, { borderColor: d.ink }]} />
                    <View style={styles.rowBetween}>
                      <Text style={[styles.pos, { color: first ? topInk : d.ink }]}>P{i + 1}</Text>
                      <View style={[styles.av34, { backgroundColor: first ? AMBER : d.surface2 }]}>
                        {u.photoURL ? (
                          <Image source={{ uri: u.photoURL }} style={styles.av34} />
                        ) : (
                          <Text style={{ fontFamily: F.extra, fontSize: 12, color: first ? INK : d.ink }}>
                            {initials(nameOf(u))}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.podName, { color: d.ink }]} numberOfLines={1}>{nameOf(u)}</Text>
                    <Text style={[styles.mono, { color: d.ink2 }]} numberOfLines={1}>
                      {km(u)}{ccOf(u) ? ` · ${ccOf(u)}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.list}>
              {rest.map((u, i) => (
                <Pressable key={u.id || i} onPress={() => openRider(u)} accessibilityRole="button" style={[styles.row, { borderTopColor: d.line }]}>
                  <Text style={[styles.rowPos, { color: d.ink2 }]}>{u.rank || u.position || i + 4}</Text>
                  <View style={[styles.av32, { backgroundColor: d.surface2 }]}>
                    {u.photoURL ? (
                      <Image source={{ uri: u.photoURL }} style={styles.av32} />
                    ) : (
                      <Text style={{ fontFamily: F.extra, fontSize: 11, color: d.ink }}>{initials(nameOf(u))}</Text>
                    )}
                  </View>
                  <Text style={[styles.rowName, { color: d.ink }]} numberOfLines={1}>
                    {nameOf(u)} <Text style={[styles.cc, { color: d.ink2 }]}>{ccOf(u)}</Text>
                  </Text>
                  <Text style={[styles.rowVal, { color: d.ink }]}>{km(u)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {me && (
        <ClipCard
          color={AMBER}
          corner={16}
          radius={18}
          style={[styles.me, { bottom: Math.max(20, insets.bottom) + 66 + 18 }]}
        >
          <View style={styles.meRow}>
            <Text style={styles.meRank}>#{me.rank || me.position || '--'}</Text>
            <View style={[styles.av32, { backgroundColor: INK }]}>
              {me.photoURL ? (
                <Image source={{ uri: me.photoURL }} style={styles.av32} />
              ) : (
                <Text style={{ fontFamily: F.extra, fontSize: 11, color: AMBER }}>{initials(nameOf(me))}</Text>
              )}
            </View>
            <Text style={styles.meName}>{t('leaderboard.you')}</Text>
            <Text style={styles.meVal}>{km(me)}</Text>
          </View>
        </ClipCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', left: 20, right: 20, gap: 14 },
  h1: { fontFamily: F.black, fontSize: 30, letterSpacing: -0.6, color: INK },
  seg: { alignSelf: 'flex-start', flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'rgba(26,24,20,0.1)' },
  segItem: { height: 36, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(26,24,20,0.72)' },
  podium: { marginHorizontal: 20, marginTop: 12, height: 232 },
  podiumCell: { position: 'absolute', width: 166, height: 102, paddingTop: 14, paddingHorizontal: 12, gap: 8 },
  podiumTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 26, borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: 0.85 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pos: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.8 },
  av34: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  av32: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  podName: { fontFamily: F.extra, fontSize: 15 },
  mono: { fontFamily: F.monoSemi, fontSize: 12 },
  list: { paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, borderTopWidth: 1 },
  rowPos: { width: 26, fontFamily: F.monoBold, fontSize: 14 },
  rowName: { flex: 1, fontFamily: F.bold, fontSize: 15 },
  cc: { fontFamily: F.bold, fontSize: 11 },
  rowVal: { fontFamily: F.monoBold, fontSize: 14 },
  me: { position: 'absolute', left: 16, right: 16, height: 58 },
  meRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  meRank: { fontFamily: F.monoBold, fontSize: 15, color: INK },
  meName: { flex: 1, fontFamily: F.extra, fontSize: 15, color: INK },
  meVal: { fontFamily: F.monoBold, fontSize: 14, color: INK },
  msg: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 8 },
  msgText: { fontFamily: F.bold, fontSize: 16, textAlign: 'center' },
  retry: { marginTop: 8, backgroundColor: AMBER, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  retryText: { fontFamily: F.extra, fontSize: 14, color: INK },
});
