import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { groupJourneyAPI } from '../services/api';
import { useJourneyState } from '../hooks/useJourneyState';
import BackgroundTaskService from '../services/backgroundTaskService';
import LiveNotificationService from '../services/liveNotificationService';

type StaleInstance = {
  id: string;
  status: 'ACTIVE' | 'PAUSED';
  groupJourneyId?: string;
  startTime?: string;
};

export default function StaleRideRecovery() {
  const [staleInstance, setStaleInstance] = useState<StaleInstance | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const { currentJourney, isTracking } = useJourneyState();

  const checkForStaleInstance = useCallback(async () => {
    // Don't check if there's already an active journey being tracked
    if (isTracking || currentJourney) return;

    try {
      const result = await groupJourneyAPI.getMyActiveInstance();
      const inst = result?.instance || result?.myInstance || result?.data || result?.journeyInstance;

      if (inst && (inst.status === 'ACTIVE' || inst.status === 'PAUSED')) {
        setStaleInstance({
          id: inst.id,
          status: inst.status,
          groupJourneyId: inst.groupJourneyId || inst.groupJourney?.id,
          startTime: inst.startTime,
        });
        setShowModal(true);
      }
    } catch {
      // Silently fail - not critical
    }
  }, [isTracking, currentJourney]);

  useEffect(() => {
    checkForStaleInstance();
  }, [checkForStaleInstance]);

  const handleResume = () => {
    if (!staleInstance?.groupJourneyId) return;
    setShowModal(false);
    setShowBanner(false);
    setStaleInstance(null);
    router.push({
      pathname: '/group-journey',
      params: { groupJourneyId: staleInstance.groupJourneyId },
    } as any);
  };

  const handleEnd = async () => {
    if (!staleInstance) return;
    try {
      await groupJourneyAPI.completeInstance(staleInstance.id, {});

      // Clean up local state so no zombie notifications / background tracking remain
      await AsyncStorage.removeItem('active_group_instance_id').catch(() => {});
      await AsyncStorage.removeItem('active_journey_id').catch(() => {});
      await AsyncStorage.removeItem('journey_start_time').catch(() => {});
      try { await LiveNotificationService.dismissNotification(); } catch {}
      try { await BackgroundTaskService.stopBackgroundTracking(); } catch {}

      setShowModal(false);
      setShowBanner(false);
      setStaleInstance(null);
      Alert.alert('Ride Ended', 'Your stale ride has been completed.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to end ride.');
    }
  };

  const handleDismissModal = () => {
    setShowModal(false);
    setShowBanner(true);
  };

  const getTimeAgo = (): string => {
    if (!staleInstance?.startTime) return '';
    const ms = Date.now() - new Date(staleInstance.startTime).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    return `${minutes}m ago`;
  };

  if (!staleInstance) return null;

  return (
    <>
      {/* Recovery Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={handleDismissModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <MaterialIcons name="warning" size={40} color="#F59E0B" />
            <Text style={styles.modalTitle}>Unfinished Ride</Text>
            <Text style={styles.modalMessage}>
              You have an {staleInstance.status.toLowerCase()} group ride from {getTimeAgo()}.
              Would you like to resume or end it?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.resumeButton} onPress={handleResume}>
                <MaterialIcons name="play-arrow" size={20} color="#FFFFFF" />
                <Text style={styles.resumeText}>Resume Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.endButton} onPress={handleEnd}>
                <MaterialIcons name="stop" size={20} color="#FFFFFF" />
                <Text style={styles.endText}>End Ride</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={handleDismissModal}>
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Persistent Banner (shown after modal dismissed) */}
      {showBanner && (
        <View style={styles.banner}>
          <MaterialIcons name="directions-bike" size={18} color="#92400E" />
          <Text style={styles.bannerText}>
            Unfinished ride ({getTimeAgo()})
          </Text>
          <TouchableOpacity style={styles.bannerButton} onPress={handleResume}>
            <Text style={styles.bannerButtonText}>Resume</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bannerEndButton} onPress={handleEnd}>
            <Text style={styles.bannerEndText}>End</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
    fontFamily: 'Space Grotesk',
  },
  modalMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
    fontFamily: 'Space Grotesk',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  resumeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  resumeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  endButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  endText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 16,
  },
  banner: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 9999,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  bannerButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  bannerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  bannerEndButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  bannerEndText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
