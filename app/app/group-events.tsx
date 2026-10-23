// app/app/group-events.tsx
// A crew's activity, laid out as the "Group activity" board: the weekly crew quest, then a feed of
// rides, messages and new members, with a bar to message the group. Rides in the feed can be
// joined or watched while they are live.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import ClipCard from '../components/dw/ClipCard';
import Icon from '../components/dw/Icon';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, GREEN_LIVE, INK, shadow, useDW } from '../constants/design';
import { useCrewActivity, useCrewState } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { groupAPI } from '../services/api';
import { relativeTime } from '../utils/recentEvents';
import { initials } from '../v2/liveBoard';

const SEGMENT = [INK, '#3D372D', '#FFFDF8', '#6E6657'];

export default function GroupEventsScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const crewId = groupId ? String(groupId) : undefined;
  const state = useCrewState(crewId);
  const feed = useCrewActivity(crewId);
  const [group, setGroup] = useState<{ name: string; members: number } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!crewId) return;
    groupAPI.getGroup(crewId)
      .then((res: any) => setGroup({ name: res?.group?.name ?? 'Group', members: res?.group?._count?.members ?? res?.group?.members?.length ?? 1 }))
      .catch(() => {});
  }, [crewId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([state.refetch(), feed.refetch()]).catch(() => {});
    setRefreshing(false);
  }, [state, feed]);

  const send = async () => {
    const body = text.trim();
    if (!body || !crewId || sending) return;
    setSending(true);
    try {
      await getRuntime().client.postCrewMessage(crewId, body);
      setText('');
      await feed.refetch();
    } catch (e: any) {
      Alert.alert('Message not sent', e?.message || 'Try again');
    } finally {
      setSending(false);
    }
  };

  const joinLive = async (rideId: string) => {
    if (!crewId) return;
    try {
      await getRuntime().client.joinCrewRide(crewId);
      router.push({ pathname: '/ride', params: { groupRideId: rideId } } as never);
    } catch (e: any) {
      Alert.alert('Could not join', e?.message || 'Try again');
    }
  };

  const top = Math.max(56, insets.top + 8);
  const q = state.data?.quest;
  const riders: { userId: string; displayName: string; km: number }[] = q?.riders ?? [];
  const surface2 = d.surface2;
  const endsDay = q?.endsAt ? new Date(new Date(q.endsAt).getTime() - 1).toLocaleDateString([], { weekday: 'long' }) : 'Sunday';
  const live = state.data?.activeRide;

  const header = (
    <View style={{ gap: 18 }}>
      {q && (
        <ClipCard color={AMBER} corner={22} radius={26}>
          <View style={styles.quest}>
            <View style={styles.questTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.questEyebrow}>Crew quest · ends {endsDay}</Text>
                <Text style={styles.questTitle}>{q.targetKm} km together</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.questNum}>{Math.round(q.kmToGo)}</Text>
                <Text style={styles.questUnit}>km to go</Text>
              </View>
            </View>
            <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: q.targetKm, now: Math.round(q.totalKm) }}>
              {riders.slice(0, 4).map((r, i) => (
                <View key={r.userId} style={{ width: `${Math.min(100, (r.km / q.targetKm) * 100)}%`, backgroundColor: SEGMENT[i] }} />
              ))}
            </View>
            <View style={styles.legend}>
              {riders.length === 0 ? (
                <Text style={styles.legendText}>Ride together to fill the bar</Text>
              ) : (
                riders.slice(0, 4).map((r, i) => (
                  <View key={r.userId} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: SEGMENT[i] }]} />
                    <Text style={styles.legendText}>{r.userId === user?.id ? 'You' : r.displayName.split(' ')[0]} {Math.round(r.km)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </ClipCard>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <View style={[styles.header, { paddingTop: top }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}>
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <View style={styles.badge}><Text style={styles.badgeText}>{initials(group?.name ?? 'G')}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: d.ink }]} numberOfLines={1}>{group?.name ?? 'Group'}</Text>
          <Text style={[styles.sub, { color: d.ink2 }]}>
            {group ? `${group.members} ${group.members === 1 ? 'rider' : 'riders'}` : ''}{live ? ` · ${live.riding} on the road` : ''}
          </Text>
        </View>
      </View>

      <FlatList
        data={feed.data?.items ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={AMBER} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={feed.isLoading ? <ActivityIndicator color={AMBER} style={{ marginTop: 32 }} /> : <Text style={[styles.empty, { color: d.ink2 }]}>Nothing yet. Say hello to the crew.</Text>}
        renderItem={({ item }) => {
          const name = item.user?.displayName || 'Someone';
          const mine = item.user?.id === user?.id;
          const first = mine ? 'You' : name.split(' ')[0];
          return (
            <View style={[styles.row, { borderBottomColor: d.line }]}>
              <View style={[styles.avatar, { backgroundColor: item.type === 'ride' ? INK : surface2 }]}>
                {item.user?.photoURL ? (
                  <Image source={{ uri: item.user.photoURL }} style={styles.avatarImg} />
                ) : (
                  <Text style={{ fontFamily: F.black, fontSize: 11, color: item.type === 'ride' ? AMBER : d.ink }}>{initials(name)}</Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                {item.type === 'message' && <Text style={[styles.rowText, { color: d.ink }]}><Text style={styles.bold}>{first}</Text>  {item.text}</Text>}
                {item.type === 'joined' && <Text style={[styles.rowText, { color: d.ink }]}><Text style={styles.bold}>{first}</Text> joined the group</Text>}
                {item.type === 'ride' && (
                  <>
                    <Text style={[styles.rowText, { color: d.ink }]}>
                      <Text style={styles.bold}>{first}</Text> started a ride{item.ride.destinationName ? ' to ' : ''}
                      {item.ride.destinationName ? <Text style={styles.bold}>{item.ride.destinationName}</Text> : null}
                    </Text>
                    {item.ride.status === 'ACTIVE' || item.ride.status === 'PLANNED' ? (
                      <View style={styles.liveRow}>
                        <View style={styles.liveBadge}>
                          <View style={styles.liveDot} />
                          <Text style={[styles.liveText, { color: d.dark ? GREEN_LIVE : '#1E7A4C' }]}>Live · {item.ride.riders} riding</Text>
                        </View>
                        <TouchableOpacity onPress={() => joinLive(item.ride.id)} accessibilityRole="button" style={styles.join}>
                          <Text style={styles.joinText}>Join</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/group-live', params: { id: item.ride.id } } as never)} accessibilityRole="button">
                          <Text style={[styles.watch, { color: d.ink2 }]}>Watch</Text>
                        </TouchableOpacity>
                      </View>
                    ) : item.ride.status === 'ENDED' ? (
                      <TouchableOpacity onPress={() => router.push({ pathname: '/group-ride-summary', params: { id: item.ride.id } } as never)} accessibilityRole="button">
                        <Text style={[styles.watch, { color: d.ink2 }]}>See the recap</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </View>
              <Text style={[styles.time, { color: d.ink2 }]}>{relativeTime(new Date(item.at).getTime())}</Text>
            </View>
          );
        }}
      />

      <View style={[styles.composer, shadow(d, 8), { backgroundColor: d.surface, bottom: Math.max(30, insets.bottom + 10) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message the group"
          placeholderTextColor={d.ink2}
          accessibilityLabel="Message the group"
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={send}
          style={[styles.composerInput, { color: d.ink }]}
        />
        <TouchableOpacity onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Send" style={[styles.send, { opacity: text.trim() && !sending ? 1 : 0.5 }]}>
          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 3 20 20 12 15.5 4 20z" fill={INK} transform="rotate(90 12 12)" /></Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 40, height: 40, borderRadius: 13, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.black, fontSize: 13, color: INK },
  title: { fontFamily: F.black, fontSize: 17 },
  sub: { fontFamily: F.regular, fontSize: 12 },
  list: { paddingHorizontal: 16, paddingTop: 6 },
  quest: { padding: 18, gap: 12 },
  questTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  questEyebrow: { fontFamily: F.black, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: INK },
  questTitle: { fontFamily: F.black, fontSize: 20, letterSpacing: -0.4, color: INK },
  questNum: { fontFamily: F.monoBold, fontSize: 24, lineHeight: 31, color: INK },
  questUnit: { fontFamily: F.bold, fontSize: 12, color: INK },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(26,24,20,0.15)', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: F.extra, fontSize: 12, color: INK },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 36, height: 36 },
  rowText: { fontFamily: F.regular, fontSize: 14, lineHeight: 19 },
  bold: { fontFamily: F.black },
  time: { fontFamily: F.mono, fontSize: 11 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN_LIVE },
  liveText: { fontFamily: F.extra, fontSize: 12 },
  join: { height: 34, paddingHorizontal: 14, borderRadius: 11, backgroundColor: AMBER, justifyContent: 'center' },
  joinText: { fontFamily: F.black, fontSize: 13, color: INK },
  watch: { fontFamily: F.extra, fontSize: 13 },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', paddingVertical: 40 },
  composer: { position: 'absolute', left: 16, right: 16, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6 },
  composerInput: { flex: 1, minWidth: 0, fontFamily: F.regular, fontSize: 15, padding: 0 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
});
