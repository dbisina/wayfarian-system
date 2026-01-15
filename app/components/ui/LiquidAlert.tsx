import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '../../contexts/AlertContext';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

const { width } = Dimensions.get('window');

export const LiquidAlert = () => {
  const { alertState, hideAlert } = useAlert();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (alertState?.visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [alertState?.visible]);

  if (!alertState) return null;

  const getIconName = () => {
    switch (alertState?.type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'warning': return 'warning';
      case 'confirm': return 'help-circle';
      case 'info': default: return 'information-circle';
    }
  };

  const getIconColor = () => {
     switch (alertState?.type) {
      case 'success': return '#4ADE80'; // Green
      case 'error': return '#EF4444'; // Red
      case 'warning': return '#F59E0B'; // Amber
      case 'confirm': return '#6366F1'; // Indigo
      case 'info': default: return '#3B82F6'; // Blue
    }
  };

  const handleConfirm = () => {
    if (alertState?.onConfirm) alertState.onConfirm();
    hideAlert();
  };

  const handleCancel = () => {
    if (alertState?.onCancel) alertState.onCancel();
    hideAlert();
  };

  // If invisible and animation done, don't render (handled by parent logic or key). 
  // But here we rely on alertState being null or distinct.
  if (!alertState) return null;

  return (
    <Modal
      transparent
      visible={alertState.visible}
      animationType="none"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View 
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <BlurView intensity={80} tint="light" style={styles.blurContainer}>
            <View style={styles.content}>
                <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '20' }]}>
                    <Ionicons name={getIconName()} size={moderateScale(32)} color={getIconColor()} />
                </View>
                
                <Text style={styles.title}>{alertState.title}</Text>
                
                {alertState.message ? (
                    <Text style={styles.message}>{alertState.message}</Text>
                ) : null}

                <View style={styles.buttonContainer}>
                    {alertState.type === 'confirm' && (
                         <TouchableOpacity 
                            style={[styles.button, styles.cancelButton]} 
                            onPress={handleCancel}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.cancelButtonText}>
                                {alertState.cancelText || 'Cancel'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity 
                        style={[
                            styles.button, 
                            styles.confirmButton,
                            alertState.type === 'confirm' ? {} : { flex: 1 }, // Full width if only one button
                            { backgroundColor: getIconColor() }
                        ]} 
                        onPress={handleConfirm}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.confirmButtonText}>
                            {alertState.confirmText || 'OK'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  container: {
    width: '100%',
    maxWidth: scale(340),
    borderRadius: scale(20),
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  blurContainer: {
    padding: scale(24),
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: verticalScale(8),
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }), // Or custom font if available
  },
  message: {
    fontSize: moderateScale(16),
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: verticalScale(24),
    lineHeight: verticalScale(22),
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: scale(12),
    width: '100%',
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  confirmButton: {
    // Color handled dynamically
  },
  cancelButtonText: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#374151',
  },
  confirmButtonText: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
