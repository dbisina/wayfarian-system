// JourneyCardMenu.tsx
// Reusable 3-dot menu component for journey cards with Edit/Delete options

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { journeyAPI } from '../../services/api';
import { useTranslation } from 'react-i18next';

interface JourneyCardMenuProps {
  journeyId: string;
  journeyTitle: string;
  onRename?: (newTitle: string) => void;
  onDelete?: () => void;
  iconColor?: string;
  iconSize?: number;
}

const JourneyCardMenu: React.FC<JourneyCardMenuProps> = ({
  journeyId,
  journeyTitle,
  onRename,
  onDelete,
  iconColor = '#757575',
  iconSize = 18,
}) => {
  const { t } = useTranslation();
  const [showActions, setShowActions] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(journeyTitle);
  const [loading, setLoading] = useState(false);

  const handleMenuPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowActions(true);
  };

  const handleEditPress = async () => {
    await Haptics.selectionAsync();
    setShowActions(false);
    setRenameValue(journeyTitle);
    setShowRename(true);
  };

  const handleDeletePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowActions(false);
    
    Alert.alert(
      t('history.deleteConfirm'),
      t('history.deleteConfirmSub'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await journeyAPI.deleteJourney(journeyId);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onDelete?.();
            } catch (err: any) {
              console.error('Delete journey error:', err);
              Alert.alert(t('alerts.error'), err.message || t('alerts.error'));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      Alert.alert(t('history.nameRequired'), t('history.shortTitle'));
      return;
    }

    try {
      setLoading(true);
      await journeyAPI.updateJourneyPreferences(journeyId, { customTitle: trimmed });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRename(false);
      onRename?.(trimmed);
    } catch (err: any) {
      console.error('Rename journey error:', err);
      Alert.alert(t('history.renameFailed'), err.message || t('alerts.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRename = () => {
    setShowRename(false);
    setRenameValue(journeyTitle);
  };

  return (
    <>
      {/* 3-dot menu button */}
      <TouchableOpacity
        onPress={handleMenuPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.menuButton}
      >
        <MaterialIcons name="more-vert" size={iconSize} color={iconColor} />
      </TouchableOpacity>

      {/* Actions Modal */}
      <Modal
        visible={showActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActions(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowActions(false)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.actionSheet}>
          <Text style={styles.actionSheetTitle} numberOfLines={1}>
            {journeyTitle || t('history.defaultTitle')}
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleEditPress}>
            <MaterialIcons name="edit" size={20} color="#111827" />
            <Text style={styles.actionButtonText}>{t('history.rename')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleDeletePress}>
            <MaterialIcons name="delete-outline" size={20} color="#DC2626" />
            <Text style={[styles.actionButtonText, styles.deleteText]}>
              {t('common.delete')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={() => setShowActions(false)}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={showRename}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRename}
      >
        <View style={styles.renameBackdrop}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>{t('history.rename')}</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={t('history.defaultTitle')}
              placeholderTextColor="#9CA3AF"
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={handleCancelRename}
              >
                <Text style={styles.renameCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameSaveBtn, loading && styles.disabledBtn]}
                onPress={handleSaveRename}
                disabled={loading}
              >
                <Text style={styles.renameSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  menuButton: {
    padding: 4,
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  actionSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 8,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'Space Grotesk',
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  actionButtonText: {
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Space Grotesk',
  },
  deleteText: {
    color: '#DC2626',
  },
  cancelButton: {
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 16,
  },
  cancelText: {
    fontSize: 15,
    color: '#6B7280',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  renameBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  renameCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Space Grotesk',
    marginBottom: 12,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Space Grotesk',
    marginBottom: 16,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  renameCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  renameCancelText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Space Grotesk',
    fontWeight: '600',
  },
  renameSaveBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  renameSaveText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});

export default JourneyCardMenu;
