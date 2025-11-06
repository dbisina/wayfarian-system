import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image } from 'react-native';
import { getEvents, subscribe, formatEvent, RecentEvent, relativeTime } from '../utils/recentEvents';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface Props {
  groupId: string;
  groupJourneyId?: string; // for server-backed View All
}

export default function RecentEventsPanel({ groupId, groupJourneyId }: Props) {
  const [events, setEvents] = useState<RecentEvent[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await getEvents(groupId);
      if (mounted) setEvents(list);
    })();
    const unsub = subscribe(async (gid) => {
      if (gid !== groupId) return;
      const list = await getEvents(groupId);
      if (mounted) setEvents(list);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [groupId]);

  if (!events.length) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Recent Activity</Text>
        </View>
  <Text style={styles.emptyText}>No recent activity yet. It will appear here, even when you&apos;re offline.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Recent Activity</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/group-events', params: { groupId, groupJourneyId } })}>
            <Text style={styles.link}>View all</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => setEvents(await getEvents(groupId))}>
            <MaterialIcons name="refresh" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.userPhotoURL ? (
              <Image source={{ uri: item.userPhotoURL }} style={styles.avatar} />
            ) : (
              <MaterialIcons name={iconFor(item)} size={18} color={colorFor(item)} style={{ marginRight: 6 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{formatEvent(item)}</Text>
              <Text style={styles.timeText}>{relativeTime(item.ts)}</Text>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        scrollEnabled={false}
      />
    </View>
  );
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    backgroundColor: '#E5E7EB',
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  timeText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  sep: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
});
