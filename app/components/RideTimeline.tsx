import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface RideEvent {
  id: string;
  type: 'MESSAGE' | 'PHOTO' | 'CHECKPOINT' | 'STATUS' | 'EMERGENCY' | 'CUSTOM';
  message?: string;
  latitude?: number;
  longitude?: number;
  mediaUrl?: string;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    photoURL?: string;
  };
}

interface RideTimelineProps {
  events: RideEvent[];
  onClose?: () => void;
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(isoDate).toLocaleDateString();
}

function getEventIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  switch (type) {
    case 'MESSAGE': return 'chat-bubble-outline';
    case 'PHOTO': return 'camera-alt';
    case 'CHECKPOINT': return 'flag';
    case 'STATUS': return 'info-outline';
    case 'EMERGENCY': return 'warning';
    default: return 'event-note';
  }
}

export default function RideTimeline({ events, onClose }: RideTimelineProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ride Timeline</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#333" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {events.length === 0 && (
          <Text style={styles.emptyText}>No events yet. Start the ride to see updates!</Text>
        )}
        {events.map((evt) => (
          <View key={evt.id} style={styles.eventRow}>
            <Image
              source={{ uri: evt.user.photoURL || require('../assets/images/2025-09-26/byc45z4XPi.png') }}
              style={styles.avatar}
            />
            <View style={styles.eventContent}>
              <View style={styles.eventHeader}>
                <Text style={styles.userName}>{evt.user.displayName}</Text>
                <Text style={styles.timestamp}>{formatRelativeTime(evt.createdAt)}</Text>
              </View>
              <View style={styles.eventBody}>
                <MaterialIcons name={getEventIcon(evt.type)} size={16} color="#666" style={styles.icon} />
                <Text style={styles.message}>
                  {evt.message || `${evt.type.toLowerCase()} event`}
                </Text>
              </View>
              {evt.mediaUrl && (
                <Image source={{ uri: evt.mediaUrl }} style={styles.media} resizeMode="cover" />
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  eventRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  eventBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  message: {
    fontSize: 14,
    color: '#555',
    flex: 1,
  },
  media: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginTop: 8,
  },
});
