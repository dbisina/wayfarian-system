import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PhotoChallenge, getActiveChallenge } from '../constants/photoChallenges';

interface Props {
  photoCount: number;
  isGroupRide: boolean;
  distanceKm: number;
  totalEstimatedKm?: number;
  onTakePhoto?: () => void;
}

const PhotoChallengeCard: React.FC<Props> = ({
  photoCount,
  isGroupRide,
  distanceKm,
  totalEstimatedKm,
  onTakePhoto,
}) => {
  const [challenge, setChallenge] = useState<PhotoChallenge | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refreshChallenge = useCallback(() => {
    const newChallenge = getActiveChallenge({
      currentHour: new Date().getHours(),
      photoCount,
      isGroupRide,
      distanceKm,
      totalEstimatedKm,
    });
    setChallenge(newChallenge);
    setDismissed(false);
  }, [photoCount, isGroupRide, distanceKm, totalEstimatedKm]);

  useEffect(() => {
    refreshChallenge();
  }, [refreshChallenge]);

  // Refresh challenge every 5 minutes
  useEffect(() => {
    const interval = setInterval(refreshChallenge, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshChallenge]);

  if (!challenge || dismissed) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={16} color="#757575" />
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <Ionicons
          name={challenge.icon as any}
          size={20}
          color="#F9A825"
        />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{challenge.title}</Text>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>+{challenge.xp} XP</Text>
          </View>
        </View>
        <Text style={styles.description}>{challenge.description}</Text>
      </View>

      {onTakePhoto && (
        <TouchableOpacity
          style={styles.cameraButton}
          onPress={onTakePhoto}
          activeOpacity={0.7}
        >
          <Ionicons name="camera" size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(249,168,37,0.2)',
  },
  dismissButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(249,168,37,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  content: {
    flex: 1,
    paddingRight: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  xpBadge: {
    backgroundColor: '#F9A825',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  xpText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Space Grotesk',
  },
  description: {
    fontSize: 12,
    color: '#757575',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  cameraButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9A825',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PhotoChallengeCard;
