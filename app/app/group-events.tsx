import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { getEvents, RecentEvent, relativeTime } from '../utils/recentEvents';
import { groupJourneyAPI } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function GroupEventsScreen() {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>All Activity</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={events}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.userPhotoURL ? (
              <Image source={{ uri: item.userPhotoURL }} style={styles.avatar} />
            ) : (
              <MaterialIcons name={iconFor(item)} size={22} color={colorFor(item)} style={{ marginRight: 8 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{item.message || fallbackMessage(item)}</Text>
              <Text style={styles.timeText}>{relativeTime(item.ts)}</Text>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No recent events yet.</Text>
          </View>
        )}
      />
    </SafeAreaView>
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

function iconFor(e: RecentEvent) {
  switch (e.type) {
    case 'member_joined':
      return 'person-add';
    case 'member_left':
      return 'person-remove';
    case 'journey_started':
      return 'navigation';
    case 'journey_completed':
      return 'flag';
    case 'instance_started':
      return 'directions-bike';
    case 'instance_paused':
      return 'pause-circle-filled';
    case 'instance_resumed':
      return 'play-circle-filled';
    case 'photo_uploaded':
      return 'photo';
    case 'message':
    default:
      return 'notifications';
  }
}

function colorFor(e: RecentEvent) {
  switch (e.type) {
    case 'journey_started':
      return '#10B981';
    case 'journey_completed':
      return '#6366F1';
    case 'member_joined':
      return '#F59E0B';
    case 'member_left':
      return '#EF4444';
    default:
      return '#6B7280';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  listContent: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB' },
  rowText: { fontSize: 14, color: '#111827' },
  timeText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  sep: { height: 1, backgroundColor: '#E5E7EB' },
  emptyBox: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#6B7280' },
});
