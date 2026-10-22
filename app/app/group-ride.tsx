// app/app/group-ride.tsx
// Group rides on the v2 engine. Everyone records their own ordinary ride; this screen handles
// membership, the leader's start/end, and links to the live view and the shared summary.
// Layout follows the "Group detail" board (cover, invite code, ride card, members).

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, GREEN_LIVE, INK, useDW } from '../constants/design';
import { useV2GroupRide, useV2GroupRides, useV2GroupSummary } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { usePresence } from '../v2/usePresence';
import { initials } from '../v2/liveBoard';
import { formatDistance, formatSpeed } from '../v2/format';

export default function GroupRideScreen() {
  const { id, code } = useLocalSearchParams<{ id?: string; code?: string }>();
  return id ? <Detail id={id} /> : <Lobby initialCode={code} />;
}

function useRefresh() {
  const { user } = useAuth();
  return () => { void getRuntime().queryClient.invalidateQueries({ queryKey: ['u', user?.id ?? 'none'] }); };
}

function Lobby({ initialCode }: { initialCode?: string }) {
  const d = useDW();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useV2GroupRides();
  const refresh = useRefresh();
  const [title, setTitle] = useState('');
  const [code, setCode] = useState((initialCode ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true);
    try {
      const g = await fn();
      refresh();
      router.push({ pathname: '/group-ride', params: { id: g.id } } as never);
    } catch (e: any) {
      Alert.alert('Group ride', e?.message || 'Something went wrong');
    } finally { setBusy(false); }
  };

  const canCreate = !busy && !!title.trim();
  const canJoin = !busy && code.length >= 4;

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView contentContainerStyle={[styles.lobby, { paddingTop: Math.max(56, insets.top + 8), paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.round, { backgroundColor: d.surface }]}>
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={[styles.h1, { color: d.ink }]}>Group ride</Text>
        <Text style={[styles.sub, { color: d.ink2 }]}>Ride with your crew</Text>

        <View style={[styles.panel, { backgroundColor: d.panel }]}>
          <Text style={[styles.panelTitle, { color: d.panelText }]}>Start one</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Name your ride"
            placeholderTextColor={d.panelMuted}
            style={[styles.panelInput, { color: d.panelText, borderColor: d.panelLine, fontFamily: F.bold }]}
          />
          <TouchableOpacity
            disabled={!canCreate}
            onPress={() => run(() => getRuntime().client.createGroupRide(Crypto.randomUUID(), { title: title.trim() }))}
            accessibilityRole="button"
            style={[styles.pill, { backgroundColor: AMBER, opacity: canCreate ? 1 : 0.45 }]}
          >
            <Text style={styles.pillText}>Create group ride</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.eyebrow, { color: d.ink2 }]}>Join a group ride with a code</Text>
        <View style={styles.joinRow}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="WF-7K2Q"
            placeholderTextColor={d.ink2}
            style={[styles.codeInput, { color: d.ink, borderColor: d.line2, backgroundColor: d.bg, fontFamily: F.monoBold }]}
          />
          <TouchableOpacity
            disabled={!canJoin}
            onPress={() => run(() => getRuntime().client.joinGroupRide(code))}
            accessibilityRole="button"
            style={[styles.joinBtn, { backgroundColor: d.ink, opacity: canJoin ? 1 : 0.45 }]}
          >
            <Text style={[styles.joinText, { color: d.bg }]}>Join</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHead}>
          <Text style={[styles.h2, { color: d.ink }]}>Your group rides</Text>
        </View>
        {list.isLoading && <ActivityIndicator color={AMBER} />}
        {(list.data?.items ?? []).map((g: any) => (
          <TouchableOpacity
            key={g.id}
            onPress={() => router.push({ pathname: '/group-ride', params: { id: g.id } } as never)}
            accessibilityRole="button"
            style={[styles.listRow, { borderTopColor: d.line }]}
          >
            <View style={[styles.badge, { backgroundColor: AMBER, width: 40, height: 40, borderRadius: 13 }]}>
              <Text style={[styles.badgeText, { fontSize: 13 }]}>{initials(g.title || '?')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, { color: d.ink }]} numberOfLines={1}>{g.title}</Text>
              <Text style={[styles.rowSub, { color: d.ink2 }]}>{statusLabel(g.status)}</Text>
            </View>
            <Icon name="chevron" size={18} color={d.ink2} stroke={2} />
          </TouchableOpacity>
        ))}
        {list.data && list.data.items.length === 0 && <Text style={[styles.rowSub, { color: d.ink2 }]}>No group rides yet.</Text>}
      </ScrollView>
    </View>
  );
}

const statusLabel = (s: string) =>
  s === 'ACTIVE' ? 'Riding now' : s === 'PLANNED' ? 'Not started' : s === 'ENDED' ? 'Finished' : s === 'CANCELLED' ? 'Cancelled' : s;

function Detail({ id }: { id: string }) {
  const d = useDW();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const refresh = useRefresh();
  const group = useV2GroupRide(id);
  const summary = useV2GroupSummary(id);
  const riders = usePresence(group.data?.status === 'ACTIVE' ? id : undefined);
  const [busy, setBusy] = useState(false);

  if (group.isLoading) return <View style={[styles.center, { backgroundColor: d.bg }]}><ActivityIndicator color={AMBER} /></View>;
  const g = group.data;
  if (!g) {
    return (
      <View style={[styles.center, { backgroundColor: d.bg }]}>
        <Text style={{ color: d.ink2, fontFamily: F.medium }}>Group ride not found.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: AMBER, fontFamily: F.bold, marginTop: 12 }}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  const isLeader = g.leaderId === user?.id;
  const active = g.participants.filter((p: any) => !p.leftAt);
  const onRoad = active.filter((p: any) => riders.some((r) => r.userId === p.userId)).length;
  const joined = active.some((p: any) => p.userId === user?.id);
  const surface2 = d.dark ? '#262420' : '#EAE5D9';
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); refresh(); } catch (e: any) { Alert.alert('Group ride', e?.message || 'Something went wrong'); } finally { setBusy(false); }
  };

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.cover, { backgroundColor: INK }]}>
          <View style={styles.coverGlow} />
          <View style={[styles.coverTop, { top: Math.max(56, insets.top + 8) }]}>
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.glass}>
              <Icon name="back" size={20} color="#FFFDF8" stroke={2} />
            </TouchableOpacity>
            {g.status === 'ENDED' && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/group-ride-summary', params: { id } } as never)}
                accessibilityRole="button"
                style={[styles.glass, { width: undefined, paddingHorizontal: 16 }]}
              >
                <Text style={styles.glassText}>Recap</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.coverHead}>
            <View style={[styles.badge, { backgroundColor: AMBER }]}>
              <Text style={styles.badgeText}>{initials(g.title || '?')}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.coverTitle} numberOfLines={2}>{g.title}</Text>
              <Text style={styles.coverSub}>
                {active.length} {active.length === 1 ? 'rider' : 'riders'}
                {g.status === 'ENDED' && summary.data ? ` · ${formatDistance(summary.data.totalDistanceM)} together` : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Pressable
            onPress={() => Share.share({ message: `Join my group ride "${g.title}" on Wayfarian with code ${g.code}.` }).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={`Share invite code ${g.code}`}
            style={[styles.invite, { borderColor: d.line2 }]}
          >
            <Text style={[styles.inviteLabel, { color: d.ink2 }]}>Invite code</Text>
            <Text style={[styles.inviteCode, { color: d.ink }]}>{g.code}</Text>
            <Text style={[styles.inviteAction, { color: d.ink }]}>Share</Text>
          </Pressable>

          {g.status !== 'CANCELLED' && (
            <View style={[styles.rideCard, { backgroundColor: d.panel }]}>
              <View style={styles.rideCardTop}>
                <View>
                  <View style={styles.liveRow}>
                    <View style={[styles.liveDot, { backgroundColor: g.status === 'ACTIVE' ? GREEN_LIVE : d.panelMuted }]} />
                    <Text style={[styles.liveLabel, { color: g.status === 'ACTIVE' ? GREEN_LIVE : d.panelMuted }]}>
                      {g.status === 'ACTIVE' ? 'Riding now' : g.status === 'PLANNED' ? 'Ready to start' : 'Finished'}
                    </Text>
                  </View>
                  <Text style={[styles.rideTitle, { color: d.panelText }]} numberOfLines={1}>
                    {g.destinationName || (g.status === 'ENDED' ? 'Ride complete' : 'Open road')}
                  </Text>
                </View>
                {g.status === 'ACTIVE' && (
                  <Text style={[styles.rideCount, { color: d.panelMuted }]}>{onRoad} of {active.length} out</Text>
                )}
              </View>

              {g.status === 'ACTIVE' && (
                <View style={styles.rideActions}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/group-live', params: { id } } as never)}
                    accessibilityRole="button"
                    style={[styles.rideBtn, { flex: 1, backgroundColor: 'rgba(244,241,233,0.1)' }]}
                  >
                    <Text style={[styles.rideBtnText, { color: d.panelText }]}>Watch live</Text>
                  </TouchableOpacity>
                  {joined && (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/ride', params: { groupRideId: id } } as never)}
                      accessibilityRole="button"
                      style={[styles.rideBtn, { flex: 1.4, backgroundColor: AMBER }]}
                    >
                      <Text style={[styles.rideBtnText, { color: INK, fontFamily: F.black }]}>Join the ride</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {g.status === 'PLANNED' && isLeader && (
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => act(() => getRuntime().client.startGroupRide(id))}
                  accessibilityRole="button"
                  style={[styles.rideBtn, { backgroundColor: AMBER, opacity: busy ? 0.6 : 1 }]}
                >
                  <Text style={[styles.rideBtnText, { color: INK, fontFamily: F.black }]}>Start group ride</Text>
                </TouchableOpacity>
              )}
              {g.status === 'PLANNED' && !isLeader && (
                <Text style={[styles.waiting, { color: d.panelMuted }]}>Waiting for the leader to start.</Text>
              )}
              {g.status === 'ENDED' && summary.data && (
                <View style={styles.rideActions}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.statLabel, { color: d.panelMuted }]}>TOP SPEED</Text>
                    <Text style={[styles.statValue, { color: d.panelText }]}>{formatSpeed(summary.data.topSpeedMps)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/group-ride-summary', params: { id } } as never)}
                    accessibilityRole="button"
                    style={[styles.rideBtn, { flex: 1.2, backgroundColor: AMBER }]}
                  >
                    <Text style={[styles.rideBtnText, { color: INK, fontFamily: F.black }]}>View recap</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={styles.sectionHead}>
            <Text style={[styles.h2, { color: d.ink }]}>Members</Text>
            <Text style={[styles.count, { color: d.ink2 }]}>{active.length}</Text>
          </View>
          {active.map((p: any) => {
            const live = riders.find((r) => r.userId === p.userId);
            const me = p.userId === user?.id;
            const role = me ? 'You' : p.role === 'LEADER' ? 'Leader' : 'Rider';
            const status = live
              ? live.speedMps != null ? formatSpeed(live.speedMps) : 'Moving'
              : p.ride ? formatDistance(p.ride.distanceM) : g.status === 'ACTIVE' ? 'Not riding' : '';
            return (
              <View key={p.userId} style={[styles.member, { borderTopColor: d.line }]}>
                <View style={[styles.avatar, { backgroundColor: me ? INK : surface2 }]}>
                  <Text style={[styles.avatarText, { color: me ? AMBER : d.ink }]}>{initials(p.displayName || 'R')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: d.ink }]} numberOfLines={1}>{p.displayName || 'Rider'}</Text>
                  <Text style={[styles.rowSub, { color: d.ink2 }]}>{p.role === 'LEADER' && me ? 'You · Leader' : role}</Text>
                </View>
                <Text style={[styles.memberStatus, { color: live ? d.ok : d.ink2 }]}>{status}</Text>
              </View>
            );
          })}

          {(g.status === 'ACTIVE' || g.status === 'PLANNED') && isLeader && (
            <TouchableOpacity
              disabled={busy}
              onPress={() => Alert.alert('End group ride?', "Everyone's rides will be finished.", [
                { text: 'Cancel', style: 'cancel' },
                { text: 'End', style: 'destructive', onPress: () => act(() => getRuntime().client.endGroupRide(id)) },
              ])}
              accessibilityRole="button"
              style={[styles.outline, { borderColor: d.line2 }]}
            >
              <Text style={[styles.outlineText, { color: d.ink }]}>End group ride</Text>
            </TouchableOpacity>
          )}
          {g.status !== 'ENDED' && g.status !== 'CANCELLED' && joined && (
            <TouchableOpacity disabled={busy} onPress={() => act(async () => { await getRuntime().client.leaveGroupRide(id); router.back(); })} accessibilityRole="button">
              <Text style={[styles.leave, { color: d.danger }]}>Leave group ride</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lobby: { paddingHorizontal: 20, gap: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.black, fontSize: 30, letterSpacing: -0.6, marginTop: 8 },
  sub: { fontFamily: F.medium, fontSize: 14, marginTop: -6 },
  panel: { borderRadius: 24, padding: 18, gap: 12, marginTop: 8 },
  panelTitle: { fontFamily: F.black, fontSize: 18 },
  panelInput: { height: 50, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16 },
  pill: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: INK, fontFamily: F.black, fontSize: 15 },
  eyebrow: { fontFamily: F.bold, fontSize: 12, marginTop: 16 },
  joinRow: { flexDirection: 'row', gap: 8 },
  codeInput: { flex: 1, minWidth: 0, height: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16, letterSpacing: 2 },
  joinBtn: { height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontFamily: F.extra, fontSize: 14 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 2 },
  h2: { fontFamily: F.black, fontSize: 18 },
  count: { fontFamily: F.extra, fontSize: 13 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1 },
  badge: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: INK, fontFamily: F.black, fontSize: 22 },
  rowName: { fontFamily: F.extra, fontSize: 15 },
  rowSub: { fontFamily: F.regular, fontSize: 12 },
  cover: { height: 316, justifyContent: 'flex-end', overflow: 'hidden' },
  coverGlow: { position: 'absolute', right: -80, top: -60, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(245,165,36,0.18)' },
  coverTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  glass: { height: 44, width: 44, borderRadius: 22, backgroundColor: 'rgba(255,253,248,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  glassText: { color: '#FFFDF8', fontFamily: F.extra, fontSize: 13 },
  coverHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingHorizontal: 20, paddingBottom: 22 },
  coverTitle: { color: '#FFFDF8', fontFamily: F.black, fontSize: 26, lineHeight: 28, letterSpacing: -0.5 },
  coverSub: { color: 'rgba(255,253,248,0.82)', fontFamily: F.regular, fontSize: 13 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  invite: { height: 52, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  inviteLabel: { fontFamily: F.bold, fontSize: 13 },
  inviteCode: { flex: 1, fontFamily: F.monoBold, fontSize: 17, letterSpacing: 2 },
  inviteAction: { fontFamily: F.black, fontSize: 13 },
  rideCard: { borderRadius: 24, padding: 16, gap: 14 },
  rideCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveLabel: { fontFamily: F.extra, fontSize: 12 },
  rideTitle: { fontFamily: F.black, fontSize: 19, marginTop: 2 },
  rideCount: { fontFamily: F.monoBold, fontSize: 13 },
  rideActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rideBtn: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  rideBtnText: { fontFamily: F.extra, fontSize: 14 },
  waiting: { fontFamily: F.medium, fontSize: 13 },
  statLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9 },
  statValue: { fontFamily: F.monoBold, fontSize: 19 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, borderTopWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.black, fontSize: 11 },
  memberStatus: { fontFamily: F.monoBold, fontSize: 12 },
  outline: { height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  outlineText: { fontFamily: F.extra, fontSize: 14 },
  leave: { fontFamily: F.semi, fontSize: 14, textAlign: 'center', marginTop: 6 },
});
