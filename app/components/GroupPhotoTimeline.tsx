import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getFirebaseDownloadUrl } from '../utils/storage';

export interface GroupTimelinePhoto {
  id: string;
  imageUrl: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  latitude?: number;
  longitude?: number;
  takenAt: string;
}

interface Props {
  photos: GroupTimelinePhoto[];
  onPhotoPress: (index: number) => void;
  memberColors: Record<string, string>;
}

const MEMBER_COLOR_PALETTE = [
  '#F9A825', '#4CAF50', '#2196F3', '#E91E63',
  '#9C27B0', '#FF5722', '#00BCD4', '#795548',
];

export const assignMemberColors = (userIds: string[]): Record<string, string> => {
  const colors: Record<string, string> = {};
  const unique = [...new Set(userIds)];
  unique.forEach((id, i) => {
    colors[id] = MEMBER_COLOR_PALETTE[i % MEMBER_COLOR_PALETTE.length];
  });
  return colors;
};

const GroupPhotoTimeline: React.FC<Props> = ({ photos, onPhotoPress, memberColors }) => {
  if (photos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="camera-outline" size={48} color="#BDBDBD" />
        <Text style={styles.emptyText}>No photos yet</Text>
        <Text style={styles.emptySubtext}>Photos taken during the ride will appear here</Text>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      {photos.map((photo, index) => {
        const photoDate = new Date(photo.takenAt);
        const timeDisplay = photoDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const hasLocation = photo.latitude && photo.longitude;
        const isLast = index >= photos.length - 1;
        const isFirst = index === 0;
        const dotColor = memberColors[photo.userId] || '#F4E04D';

        const photoUri = getFirebaseDownloadUrl(photo.imageUrl) || photo.imageUrl;

        return (
          <View key={photo.id} style={styles.timelineItem}>
            {/* Left: Time + Dot */}
            <View style={styles.timelineLeft}>
              <Text style={styles.timelineTime}>{timeDisplay}</Text>
              <View style={styles.timelineMarker}>
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: isFirst ? '#4CAF50' : dotColor },
                    { borderColor: isFirst ? '#2E7D32' : dotColor },
                  ]}
                />
                {!isLast && <View style={styles.timelineLine} />}
              </View>
            </View>

            {/* Right: Photo Card */}
            <View style={styles.timelineContent}>
              <TouchableOpacity
                style={styles.photoCard}
                activeOpacity={0.8}
                onPress={() => onPhotoPress(index)}
              >
                {photoUri && (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoImage}
                    contentFit="cover"
                    transition={200}
                  />
                )}

                {/* Member Avatar Chip */}
                <View style={[styles.memberChip, { borderColor: dotColor }]}>
                  {photo.userPhotoURL ? (
                    <Image
                      source={{ uri: photo.userPhotoURL }}
                      style={styles.memberAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.memberAvatarPlaceholder, { backgroundColor: dotColor }]}>
                      <Text style={styles.memberAvatarInitial}>
                        {(photo.userName || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.memberName} numberOfLines={1}>
                    {photo.userName}
                  </Text>
                </View>

                {/* Location Badge */}
                {hasLocation && (
                  <View style={styles.locationBadge}>
                    <Ionicons name="location" size={10} color="#fff" />
                    <Text style={styles.locationText}>
                      {photo.latitude?.toFixed(3)}, {photo.longitude?.toFixed(3)}
                    </Text>
                  </View>
                )}

                {/* Start/Finish Marker */}
                {isFirst && (
                  <View style={styles.markerBadge}>
                    <Text style={styles.markerText}>START</Text>
                  </View>
                )}
                {isLast && photos.length > 1 && (
                  <View style={[styles.markerBadge, styles.finishBadge]}>
                    <Text style={styles.markerText}>FINISH</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  timeline: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineLeft: {
    width: 72,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineTime: {
    fontSize: 11,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginBottom: 6,
  },
  timelineMarker: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  photoCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  photoImage: {
    width: '100%',
    height: 180,
  },
  memberChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingRight: 10,
    paddingLeft: 2,
    paddingVertical: 2,
    borderWidth: 1.5,
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  memberAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarInitial: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  memberName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3E4751',
    fontFamily: 'Space Grotesk',
    marginLeft: 6,
    maxWidth: 100,
  },
  locationBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  locationText: {
    fontSize: 10,
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  markerBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  finishBadge: {
    backgroundColor: '#F9A825',
  },
  markerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9E9E9E',
    fontFamily: 'Space Grotesk',
    marginTop: 4,
  },
});

export default GroupPhotoTimeline;
