import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

export interface RideEvent {
  id: string;
  type: 'MESSAGE' | 'PHOTO' | 'CHECKPOINT' | 'STATUS' | 'EMERGENCY' | 'CUSTOM' | 'COMPLETED';
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

  if (diffSec < 60) return i18n.t('components.rideTimeline.justNow');
  if (diffMin < 60) return i18n.t('components.rideTimeline.minutesAgo', { time: diffMin });
  if (diffHr < 24) return i18n.t('components.rideTimeline.hoursAgo', { time: diffHr });
  return new Date(isoDate).toLocaleDateString();
}

function getEventIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  switch (type) {
    case 'MESSAGE': return 'chat-bubble-outline';
    case 'PHOTO': return 'camera-alt';
    case 'CHECKPOINT': return 'flag';
    case 'STATUS': return 'info-outline';
    case 'EMERGENCY': return 'warning';
    case 'COMPLETED': return 'check-circle';
    default: return 'event-note';
  }
}

export default function RideTimeline({ events, onClose }: RideTimelineProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('components.rideTimeline.title')}</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#333" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {events.length === 0 && (
          <Text style={styles.emptyText}>{t('components.rideTimeline.empty')}</Text>
        )}
        {events.map((evt, index) => (
          <View key={evt.id} style={styles.timelineItem}>
            {/* Vertical Line connecting items */}
            {index !== events.length - 1 && <View style={styles.verticalLine} />}
            
            <View style={styles.avatarContainer}>
              <Image
                source={
                  evt.user.photoURL
                    ? { uri: evt.user.photoURL }
                    : require('../assets/images/2025-09-26/byc45z4XPi.png')
                }
                style={styles.avatar}
              />
            </View>
            
            <View style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <Text style={styles.userName}>{evt.user.displayName}</Text>
                <Text style={styles.timestamp}>{formatRelativeTime(evt.createdAt)}</Text>
              </View>
              
              <View style={styles.eventBody}>
                {evt.type !== 'PHOTO' && (
                  <MaterialIcons name={getEventIcon(evt.type)} size={16} color="#666" style={styles.icon} />
                )}
                <Text style={styles.message}>
                  {evt.message || `${evt.type.toLowerCase()} event`}
                </Text>
              </View>
              
              {evt.mediaUrl && (
                <View style={styles.mediaContainer}>
                  <Image source={{ uri: evt.mediaUrl }} style={styles.media} resizeMode="cover" />
                  <View style={styles.captionOverlay}>
                    <Text style={styles.captionText}>{t('components.rideTimeline.photoBy', { name: evt.user.displayName })}</Text>
                  </View>
                </View>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#fff',
    zIndex: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 32,
    paddingHorizontal: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 20,
    position: 'relative',
  },
  verticalLine: {
    position: 'absolute',
    left: 36, // 16 (padding) + 20 (half avatar width)
    top: 40,
    bottom: -20, // Extend to next item
    width: 2,
    backgroundColor: '#E5E7EB',
    zIndex: 0,
  },
  avatarContainer: {
    marginRight: 12,
    zIndex: 1,
    backgroundColor: '#FFF', // Hide line behind avatar
    borderRadius: 20,
    padding: 2, // Small border effect
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  eventCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  timestamp: {
    fontSize: 11,
    color: '#6B7280',
  },
  eventBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  message: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
    lineHeight: 20,
  },
  mediaContainer: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  media: {
    width: '100%',
    height: 180,
  },
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  captionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
});
