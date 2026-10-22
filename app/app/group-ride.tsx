// app/app/group-ride.tsx
// Group rides on the v2 engine. Everyone records their own ordinary ride; this screen handles
// membership, the leader's start/end, and shows live positions and the shared summary.

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, useDW } from '../constants/design';
import { useV2GroupRide, useV2GroupRides, useV2GroupSummary } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { usePresence } from '../v2/usePresence';
import { formatDistance, formatSpeed } from '../v2/format';

export default function GroupRideScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <Detail id={id} /> : <Lobby />;
}

function useRefresh() {
  const { user } = useAuth();
  return () => { void getRuntime().queryClient.invalidateQueries({ queryKey: ['u', user?.id ?? 'none'] }); };
}

function Lobby() {
  const dw = useDW();
  const router = useRouter();
  const list = useV2GroupRides();
  const refresh = useRefresh();
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
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

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dw.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, { color: dw.ink, fontFamily: F.black }]}>Group rides</Text>

        <Text style={[styles.label, { color: dw.ink2, fontFamily: F.semi }]}>START ONE</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Name your ride" placeholderTextColor={dw.ink2}
          style={[styles.input, { color: dw.ink, borderColor: dw.line2, backgroundColor: dw.surface, fontFamily: F.medium }]} />
        <Pressable disabled={busy || !title.trim()} onPress={() => run(() => getRuntime().client.createGroupRide(Crypto.randomUUID(), { title: title.trim() }))}
          style={[styles.btn, { backgroundColor: AMBER, opacity: busy || !title.trim() ? 0.5 : 1 }]}>
          <Text style={[styles.btnText, { fontFamily: F.black }]}>Create</Text>
        </Pressable>

        <Text style={[styles.label, { color: dw.ink2, fontFamily: F.semi, marginTop: 24 }]}>JOIN WITH A CODE</Text>
        <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="ABC123" placeholderTextColor={dw.ink2}
          style={[styles.input, { color: dw.ink, borderColor: dw.line2, backgroundColor: dw.surface, fontFamily: F.monoBold }]} />
        <Pressable disabled={busy || code.length < 4} onPress={() => run(() => getRuntime().client.joinGroupRide(code))}
          style={[styles.btn, { backgroundColor: dw.surface, borderColor: dw.line2, borderWidth: 1, opacity: busy || code.length < 4 ? 0.5 : 1 }]}>
          <Text style={[styles.btnText, { color: dw.ink, fontFamily: F.bold }]}>Join</Text>
        </Pressable>

        <Text style={[styles.label, { color: dw.ink2, fontFamily: F.semi, marginTop: 24 }]}>YOUR GROUP RIDES</Text>
        {list.isLoading && <ActivityIndicator color={AMBER} />}
        {(list.data?.items ?? []).map((g: any) => (
          <Pressable key={g.id} onPress={() => router.push({ pathname: '/group-ride', params: { id: g.id } } as never)}
            style={[styles.card, { backgroundColor: dw.surface, borderColor: dw.line }]}>
            <Text style={[styles.cardTitle, { color: dw.ink, fontFamily: F.bold }]}>{g.title}</Text>
            <Text style={{ color: dw.ink2, fontFamily: F.mono }}>{g.status}</Text>
          </Pressable>
        ))}
        {list.data && list.data.items.length === 0 && <Text style={{ color: dw.ink2, fontFamily: F.medium }}>No group rides yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ id }: { id: string }) {
  const dw = useDW();
  const router = useRouter();
  const { user } = useAuth();
  const refresh = useRefresh();
  const group = useV2GroupRide(id);
  const summary = useV2GroupSummary(id);
  const riders = usePresence(group.data?.status === 'ACTIVE' ? id : undefined);
  const [busy, setBusy] = useState(false);

  if (group.isLoading) return <SafeAreaView style={[styles.center, { backgroundColor: dw.bg }]}><ActivityIndicator color={AMBER} /></SafeAreaView>;
  const g = group.data;
  if (!g) return <SafeAreaView style={[styles.center, { backgroundColor: dw.bg }]}><Text style={{ color: dw.ink2 }}>Group ride not found.</Text></SafeAreaView>;

  const isLeader = g.leaderId === user?.id;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); refresh(); } catch (e: any) { Alert.alert('Group ride', e?.message || 'Something went wrong'); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dw.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}><Text style={{ color: AMBER, fontFamily: F.bold }}>‹ Back</Text></Pressable>
        <Text style={[styles.h1, { color: dw.ink, fontFamily: F.black }]}>{g.title}</Text>
        <Text style={{ color: dw.ink2, fontFamily: F.monoBold, letterSpacing: 2 }}>CODE {g.code}  ·  {g.status}</Text>

        <Text style={[styles.label, { color: dw.ink2, fontFamily: F.semi, marginTop: 20 }]}>RIDERS</Text>
        {g.participants.filter((p: any) => !p.leftAt).map((p: any) => {
          const live = riders.find((r) => r.userId === p.userId);
          return (
            <View key={p.userId} style={[styles.card, { backgroundColor: dw.surface, borderColor: dw.line }]}>
              <Text style={[styles.cardTitle, { color: dw.ink, fontFamily: F.bold }]}>{p.displayName || 'Rider'}{p.role === 'LEADER' ? '  ★' : ''}</Text>
              <Text style={{ color: live ? dw.ok : dw.ink2, fontFamily: F.mono }}>
                {live ? `live · ${live.speedMps != null ? formatSpeed(live.speedMps) : 'moving'}` : p.ride ? formatDistance(p.ride.distanceM) : '—'}
              </Text>
            </View>
          );
        })}

        {g.status === 'ENDED' && summary.data && (
          <>
            <Text style={[styles.label, { color: dw.ink2, fontFamily: F.semi, marginTop: 20 }]}>RESULT</Text>
            <Text style={{ color: dw.ink, fontFamily: F.monoBold, fontSize: 20 }}>
              {formatDistance(summary.data.totalDistanceM)} · top {formatSpeed(summary.data.topSpeedMps)}
            </Text>
            {summary.data.riders.map((r: any) => (
              <Text key={r.userId} style={{ color: dw.ink2, fontFamily: F.medium }}>{r.rank}. {r.displayName || 'Rider'} — {formatDistance(r.distanceM)}</Text>
            ))}
          </>
        )}

        <View style={styles.actions}>
          {g.status === 'PLANNED' && isLeader && (
            <Pressable disabled={busy} onPress={() => act(() => getRuntime().client.startGroupRide(id))} style={[styles.btn, { backgroundColor: AMBER }]}>
              <Text style={[styles.btnText, { fontFamily: F.black }]}>Start group ride</Text>
            </Pressable>
          )}
          {g.status === 'ACTIVE' && (
            <Pressable onPress={() => router.push({ pathname: '/group-live', params: { id } } as never)} style={[styles.btn, { backgroundColor: dw.surface, borderColor: dw.line2, borderWidth: 1 }]}>
              <Text style={[styles.btnText, { color: dw.ink, fontFamily: F.bold }]}>Open live view</Text>
            </Pressable>
          )}
          {g.status === 'ACTIVE' && (
            <Pressable onPress={() => router.push({ pathname: '/ride', params: { groupRideId: id } } as never)} style={[styles.btn, { backgroundColor: AMBER }]}>
              <Text style={[styles.btnText, { fontFamily: F.black }]}>Record my ride</Text>
            </Pressable>
          )}
          {(g.status === 'ACTIVE' || g.status === 'PLANNED') && isLeader && (
            <Pressable disabled={busy} onPress={() => Alert.alert('End group ride?', 'Everyone\'s rides will be finished.', [
              { text: 'Cancel', style: 'cancel' }, { text: 'End', style: 'destructive', onPress: () => act(() => getRuntime().client.endGroupRide(id)) }])}
              style={[styles.btn, { backgroundColor: dw.surface, borderColor: dw.line2, borderWidth: 1 }]}>
              <Text style={[styles.btnText, { color: dw.ink, fontFamily: F.bold }]}>End group ride</Text>
            </Pressable>
          )}
          {g.status !== 'ENDED' && g.status !== 'CANCELLED' && (
            <Pressable disabled={busy} onPress={() => act(async () => { await getRuntime().client.leaveGroupRide(id); router.back(); })}>
              <Text style={{ color: dw.danger, fontFamily: F.semi, textAlign: 'center', marginTop: 8 }}>Leave</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 8 },
  h1: { fontSize: 28, marginVertical: 8 },
  label: { fontSize: 11, letterSpacing: 1.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText: { fontSize: 16, color: '#1A1814' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16 },
  actions: { marginTop: 20, gap: 10 },
});
