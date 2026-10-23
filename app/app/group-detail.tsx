// app/app/group-detail.tsx
// A crew, laid out as the "Group detail" board: cover and name, invite code, the crew's ride card
// (start, join, watch live or end), and the members. Rides are v2 group rides linked to the crew, so
// the live view, recording and recap are the same screens as any group ride.

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import KeyboardInset from '../components/dw/KeyboardInset';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, GREEN_LIVE, INK, useDW } from '../constants/design';
import { defaultCoverFor } from '../constants/covers';
import { groupAPI } from '../services/api';
import { useCrewState } from '../v2/hooks';
import { getRuntime } from '../v2/runtime';
import { initials } from '../v2/liveBoard';

interface Member {
  id: string;
  userId: string;
  role: string;
  user: { id: string; displayName: string | null; photoURL: string | null };
}

interface Group {
  id: string;
  name: string;
  code: string;
  coverPhotoURL?: string | null;
  creator: { id: string };
  members: Member[];
  _count?: { members: number };
}

const roleLabel = (role: string) => (role === 'CREATOR' ? 'Creator' : role === 'ADMIN' ? 'Admin' : 'Rider');

export default function GroupDetailScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const id = groupId ? String(groupId) : undefined;
  const state = useCrewState(id);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await groupAPI.getGroup(id);
      if (res?.success && res?.group) setGroup(res.group);
    } catch (e: any) {
      Alert.alert('Could not load the group', e?.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); state.refetch(); }, [load])); // eslint-disable-line react-hooks/exhaustive-deps

  const me = group?.members.find((m) => m.userId === user?.id);
  const isAdmin = !!me && (me.role === 'ADMIN' || me.role === 'CREATOR');
  const isCreator = group?.creator.id === user?.id;
  const ride = state.data?.activeRide;
  const surface2 = d.surface2;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e: any) { Alert.alert('Group ride', e?.message || 'Something went wrong'); } finally { setBusy(false); }
  };

  const startRide = () => run(async () => {
    if (!id) return;
    const rideId = Crypto.randomUUID();
    const res = await getRuntime().client.startCrewRide(id, { id: rideId });
    await state.refetch();
    router.push({ pathname: '/ride', params: { groupRideId: res?.id ?? rideId } } as never);
  });

  const joinRide = () => run(async () => {
    if (!id || !ride) return;
    await getRuntime().client.joinCrewRide(id);
    await state.refetch();
    router.push({ pathname: '/ride', params: { groupRideId: ride.id } } as never);
  });

  const endRide = () => Alert.alert('End the group ride?', "Everyone's rides will be finished.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'End', style: 'destructive', onPress: () => run(async () => { if (id) { await getRuntime().client.endCrewRide(id); await state.refetch(); } }) },
  ]);

  const changeCover = async () => {
    setMenu(false);
    try {
      await new Promise((r) => setTimeout(r, 100)); // lets the picker register on Android
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
      if (res.canceled || !res.assets?.length || !group) return;
      await groupAPI.uploadGroupCover(group.id, res.assets[0].uri);
      await load();
    } catch (e: any) {
      Alert.alert('Could not change the cover', e?.message || 'Try again');
    }
  };

  const saveName = () => run(async () => {
    if (!group || !newName.trim()) return;
    await groupAPI.updateGroup(group.id, { name: newName.trim() });
    setRenaming(false);
    await load();
  });

  const deleteGroup = () => {
    setMenu(false);
    if (!group) return;
    if (ride) return Alert.alert('Cannot delete', 'End the group ride before deleting the group.');
    Alert.alert('Delete group', `Delete "${group.name}" for everyone? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(async () => { await groupAPI.deleteGroup(group.id); router.back(); }) },
    ]);
  };

  const leaveGroup = () => {
    setMenu(false);
    if (!group) return;
    Alert.alert('Leave group', `Leave "${group.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => run(async () => { await groupAPI.leaveGroup(group.id); router.back(); }) },
    ]);
  };

  if (loading) return <View style={[styles.center, { backgroundColor: d.bg }]}><ActivityIndicator color={AMBER} /></View>;
  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: d.bg }]}>
        <Text style={{ color: d.ink2, fontFamily: F.medium }}>This group is not available.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: AMBER, fontFamily: F.bold, marginTop: 12 }}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  const count = group._count?.members ?? group.members.length;
  const top = Math.max(56, insets.top + 8);

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.cover}>
          <Image source={group.coverPhotoURL ? { uri: group.coverPhotoURL } : defaultCoverFor(group.id)} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.coverShade} />
          <View style={[styles.coverTop, { top }]}>
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.glass}>
              <Icon name="back" size={20} color="#FFFDF8" stroke={2} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => router.push({ pathname: '/group-events', params: { groupId: group.id } } as never)} accessibilityRole="button" style={[styles.glass, styles.glassPill]}>
                <Text style={styles.glassText}>Activity</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="More" style={styles.glass}>
                <Icon name="settings" size={18} color="#FFFDF8" stroke={2} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.coverHead}>
            <View style={styles.badge}><Text style={styles.badgeText}>{initials(group.name)}</Text></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.coverTitle} numberOfLines={2}>{group.name}</Text>
              <Text style={styles.coverSub}>{count} {count === 1 ? 'rider' : 'riders'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <TouchableOpacity
            onPress={() => Share.share({ message: `Join "${group.name}" on Wayfarian with code ${group.code}.` }).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={`Share invite code ${group.code}`}
            style={[styles.invite, { borderColor: d.line2 }]}
          >
            <Text style={[styles.inviteLabel, { color: d.ink2 }]}>Invite code</Text>
            <Text style={[styles.inviteCode, { color: d.ink }]}>{group.code}</Text>
            <Text style={[styles.inviteAction, { color: d.ink }]}>Share</Text>
          </TouchableOpacity>

          <View style={[styles.panel, { backgroundColor: d.panel }]}>
            <View style={styles.panelTop}>
              <View style={{ flex: 1 }}>
                <View style={styles.liveRow}>
                  <View style={[styles.dot, { backgroundColor: ride ? GREEN_LIVE : d.panelMuted }]} />
                  <Text style={[styles.liveLabel, { color: ride ? GREEN_LIVE : d.panelMuted }]}>{ride ? 'Riding now' : 'No ride yet'}</Text>
                </View>
                <Text style={[styles.panelTitle, { color: d.panelText }]} numberOfLines={1}>
                  {ride ? ride.destinationName || ride.title : 'Ready when you are'}
                </Text>
              </View>
              {ride && <Text style={[styles.panelCount, { color: d.panelMuted }]}>{ride.riding} out</Text>}
            </View>

            {ride ? (
              <>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/group-live', params: { id: ride.id } } as never)} accessibilityRole="button" style={[styles.pillBtn, { flex: 1, backgroundColor: 'rgba(244,241,233,0.1)' }]}>
                    <Text style={[styles.pillText, { color: d.panelText }]}>Watch live</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={ride.joined ? () => router.push({ pathname: '/ride', params: { groupRideId: ride.id } } as never) : joinRide}
                    disabled={busy}
                    accessibilityRole="button"
                    style={[styles.pillBtn, { flex: 1.4, backgroundColor: AMBER, opacity: busy ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.pillText, { color: INK, fontFamily: F.black }]}>{ride.joined ? 'Open my ride' : 'Join the ride'}</Text>
                  </TouchableOpacity>
                </View>
                {(isAdmin || ride.leaderId === user?.id) && (
                  <TouchableOpacity onPress={endRide} accessibilityRole="button" style={styles.endBtn}>
                    <Text style={[styles.endText, { color: d.panelMuted }]}>End the group ride</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <TouchableOpacity onPress={startRide} disabled={busy} accessibilityRole="button" style={[styles.pillBtn, { backgroundColor: AMBER, opacity: busy ? 0.6 : 1 }]}>
                <Icon name="nav" size={16} color={INK} fill />
                <Text style={[styles.pillText, { color: INK, fontFamily: F.black, marginLeft: 8 }]}>Start a ride</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionHead}>
            <Text style={[styles.h2, { color: d.ink }]}>Members</Text>
            <Text style={[styles.count, { color: d.ink2 }]}>{count}</Text>
          </View>
          {group.members.slice(0, 20).map((m) => {
            const you = m.userId === user?.id;
            const name = m.user?.displayName || 'Rider';
            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => (you ? router.push('/profile' as never) : router.push({ pathname: '/rider-profile', params: { riderId: m.userId } } as never))}
                accessibilityRole="button"
                style={[styles.member, { borderTopColor: d.line }]}
              >
                <View style={[styles.avatar, { backgroundColor: you ? INK : surface2 }]}>
                  {m.user?.photoURL ? <Image source={{ uri: m.user.photoURL }} style={styles.avatarImg} /> : <Text style={[styles.avatarText, { color: you ? AMBER : d.ink }]}>{initials(name)}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: d.ink }]} numberOfLines={1}>{name}</Text>
                  <Text style={[styles.role, { color: d.ink2 }]}>{you ? `You · ${roleLabel(m.role)}` : roleLabel(m.role)}</Text>
                </View>
                <Icon name="chevron" size={18} color={d.ink2} stroke={2} />
              </TouchableOpacity>
            );
          })}
          {count > 20 && <Text style={[styles.more, { color: d.ink2 }]}>+{count - 20} more</Text>}
        </View>
      </ScrollView>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setMenu(false)} style={styles.scrim}>
          <View style={[styles.sheet, { backgroundColor: d.surface, paddingBottom: Math.max(16, insets.bottom + 8) }]}>
            {isAdmin && <MenuRow label="Change cover" onPress={changeCover} color={d.ink} />}
            {isAdmin && <MenuRow label="Rename group" onPress={() => { setMenu(false); setNewName(group.name); setRenaming(true); }} color={d.ink} />}
            {isCreator ? <MenuRow label="Delete group" onPress={deleteGroup} color={d.danger} /> : <MenuRow label="Leave group" onPress={leaveGroup} color={d.danger} />}
            <MenuRow label="Cancel" onPress={() => setMenu(false)} color={d.ink2} />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <KeyboardInset>
          <View style={styles.scrimCenter}>
            <View style={[styles.dialog, { backgroundColor: d.surface }]}>
              <Text style={[styles.h2, { color: d.ink }]}>Rename group</Text>
              <TextInput value={newName} onChangeText={setNewName} maxLength={32} autoFocus accessibilityLabel="Group name" style={[styles.dialogInput, { color: d.ink, backgroundColor: d.bg }]} />
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setRenaming(false)} accessibilityRole="button" style={[styles.pillBtn, { flex: 1, borderWidth: 1.5, borderColor: d.line2 }]}>
                  <Text style={[styles.pillText, { color: d.ink }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveName} disabled={busy || !newName.trim()} accessibilityRole="button" style={[styles.pillBtn, { flex: 1, backgroundColor: AMBER, opacity: busy || !newName.trim() ? 0.5 : 1 }]}>
                  <Text style={[styles.pillText, { color: INK, fontFamily: F.black }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardInset>
      </Modal>
    </View>
  );
}

function MenuRow({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={styles.menuRow}>
      <Text style={[styles.menuText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 316, justifyContent: 'flex-end', backgroundColor: INK },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,16,14,0.38)' },
  coverTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  glass: { height: 44, width: 44, borderRadius: 22, backgroundColor: 'rgba(26,24,20,0.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  glassPill: { width: undefined, paddingHorizontal: 16 },
  glassText: { color: '#FFFDF8', fontFamily: F.extra, fontSize: 13 },
  coverHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingHorizontal: 20, paddingBottom: 22 },
  badge: { width: 64, height: 64, borderRadius: 21, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.black, fontSize: 22, color: INK },
  coverTitle: { color: '#FFFDF8', fontFamily: F.black, fontSize: 26, lineHeight: 28, letterSpacing: -0.5 },
  coverSub: { color: 'rgba(255,253,248,0.82)', fontFamily: F.regular, fontSize: 13 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  invite: { height: 52, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  inviteLabel: { fontFamily: F.bold, fontSize: 13 },
  inviteCode: { flex: 1, fontFamily: F.monoBold, fontSize: 17, letterSpacing: 2 },
  inviteAction: { fontFamily: F.black, fontSize: 13 },
  panel: { borderRadius: 24, padding: 16, gap: 14 },
  panelTop: { flexDirection: 'row', alignItems: 'flex-start' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveLabel: { fontFamily: F.extra, fontSize: 12 },
  panelTitle: { fontFamily: F.black, fontSize: 19, marginTop: 2 },
  panelCount: { fontFamily: F.monoBold, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  pillBtn: { height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: F.extra, fontSize: 14 },
  endBtn: { alignItems: 'center', paddingVertical: 2 },
  endText: { fontFamily: F.semi, fontSize: 13 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  h2: { fontFamily: F.black, fontSize: 18 },
  count: { fontFamily: F.extra, fontSize: 13 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, borderTopWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 36, height: 36 },
  avatarText: { fontFamily: F.black, fontSize: 11 },
  name: { fontFamily: F.extra, fontSize: 15 },
  role: { fontFamily: F.regular, fontSize: 12 },
  more: { fontFamily: F.semi, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  scrim: { flex: 1, backgroundColor: 'rgba(17,16,14,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, paddingHorizontal: 12 },
  menuRow: { height: 54, justifyContent: 'center', paddingHorizontal: 12 },
  menuText: { fontFamily: F.extra, fontSize: 16 },
  scrimCenter: { flex: 1, backgroundColor: 'rgba(17,16,14,0.55)', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 24, padding: 20, gap: 16 },
  dialogInput: { height: 52, borderRadius: 16, paddingHorizontal: 16, fontFamily: F.extra, fontSize: 17 },
});
