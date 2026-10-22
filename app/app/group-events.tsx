import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, RefreshControl, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { useLocalSearchParams, router } from 'expo-router';
import { getEvents, RecentEvent, relativeTime } from '../utils/recentEvents';
import { groupJourneyAPI } from '../services/api';

export default function GroupEventsScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { groupId, groupJourneyId } = useLocalSearchParams<{ groupId?: string; groupJourneyId?: string }>();
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    const localList = await getEvents(String(groupId));
    let merged = [...localList];
    if (groupJourneyId) {
      try {
        const res = await groupJourneyAPI.listEvents(String(groupJourneyId));
        const serverEvents = Array.isArray(res?.events) ? res.events : [];
        const mapped: RecentEvent[] = serverEvents.map((evt: any) => {
          const ts = evt?.createdAt ? new Date(evt.createdAt).getTime() : Date.now();
          const base = {
            id: `srv_${evt.id}`,
            ts,
            groupId: String(groupId),
            groupJourneyId: String(groupJourneyId),
            userId: evt?.user?.id,
            userName: evt?.user?.displayName,
            userPhotoURL: evt?.user?.photoURL,
            meta: { latitude: evt?.latitude, longitude: evt?.longitude, mediaUrl: evt?.mediaUrl, rawType: evt?.type, data: evt?.data },
          } as const;
          const t = String(evt?.type || '').toUpperCase();
          if (t === 'MESSAGE') return { ...base, type: 'message', message: evt?.message } as RecentEvent;
          if (t === 'PHOTO') return { ...base, type: 'photo_uploaded', message: evt?.message || 'Photo shared' } as RecentEvent;
          if (t === 'STATUS') {
            const sc = String(evt?.data?.status || evt?.data?.code || '').toUpperCase();
            if (sc === 'PAUSED' || sc === 'PAUSE') return { ...base, type: 'instance_paused', message: evt?.message || 'Paused' } as RecentEvent;
            if (sc === 'RESUMED' || sc === 'RESUME') return { ...base, type: 'instance_resumed', message: evt?.message || 'Resumed' } as RecentEvent;
            return { ...base, type: 'message', message: evt?.message || sc || 'Status update' } as RecentEvent;
          }
          return { ...base, type: 'message', message: evt?.message || 'Event' } as RecentEvent;
        });
        const seen = new Set(merged.map(e => e.id));
        for (const me of mapped) {
          if (!seen.has(me.id)) {
            merged.push(me); seen.add(me.id);
          }
        }
      } catch {
        // ignore network errors; show local only
      }
    }
    merged.sort((a, b) => b.ts - a.ts);
    setEvents(merged);
  }, [groupId, groupJourneyId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const initialsOf = (n?: string | null) =>
    (n || '?').split(/s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('');

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <View style={[styles.header, { paddingTop: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: d.ink }]}>Activity</Text>
          <Text style={[styles.sub, { color: d.ink2 }]}>{events.length} {events.length === 1 ? 'update' : 'updates'}</Text>
        </View>
      </View>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={events}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />}
        renderItem={({ item }) => {
          const mine = item.type === 'journey_started' && !!groupJourneyId;
          return (
            <View style={[styles.row, { borderBottomColor: d.line }]}>
              <View style={[styles.avatar, { backgroundColor: d.surface2 }]}>
                {item.userPhotoURL ? (
                  <Image source={{ uri: item.userPhotoURL }} style={styles.avatar} />
                ) : (
                  <Text style={{ fontFamily: F.black, fontSize: 11, color: d.ink }}>{initialsOf(item.userName)}</Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={[styles.rowText, { color: d.ink }]}>{item.message || fallbackMessage(item)}</Text>
                {mine && (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/group-journey', params: { groupJourneyId: String(groupJourneyId), groupId: String(groupId) } } as never)}
                    accessibilityRole="button"
                    style={styles.join}
                  >
                    <Text style={styles.joinText}>Join</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.time, { color: d.ink2 }]}>{relativeTime(item.ts)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={() => (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: d.ink2 }]}>No recent events yet.</Text>
          </View>
        )}
      />
    </View>
  );
}

function fallbackMessage(e: RecentEvent) {
  switch (e.type) {
    case 'member_joined':
      return `${e.userName || 'A member'} joined`;
    case 'member_left':
      return `${e.userName || 'A member'} left`;
    case 'journey_started':
      return 'Group journey started';
    case 'journey_completed':
      return 'Group journey completed';
    case 'instance_started':
      return 'A rider started riding';
    case 'instance_paused':
      return 'A rider paused';
    case 'instance_resumed':
      return 'A rider resumed';
    case 'photo_uploaded':
      return `${e.userName || 'A rider'} shared a photo`;
    case 'message':
    default:
      return 'Update';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  sub: { fontFamily: F.regular, fontSize: 12 },
  listContent: { padding: 16, paddingBottom: 60 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowText: { fontFamily: F.medium, fontSize: 14, lineHeight: 19 },
  time: { fontFamily: F.mono, fontSize: 11 },
  join: { alignSelf: 'flex-start', height: 34, paddingHorizontal: 14, borderRadius: 11, backgroundColor: AMBER, justifyContent: 'center' },
  joinText: { fontFamily: F.black, fontSize: 13, color: INK },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyText: { fontFamily: F.medium, fontSize: 14 },
});
