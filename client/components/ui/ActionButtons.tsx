import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ActionButtonsProps {
  isTracking: boolean;
  onStartTracking: () => void;
}

const ActionButtons = ({ isTracking, onStartTracking }: ActionButtonsProps) => {
  return (
    <View style={styles.actionButtons}>
      <TouchableOpacity 
        style={[styles.actionButton, styles.actionButtonStart, isTracking && styles.actionButtonActive]}
        onPress={onStartTracking}
      >
        <MaterialIcons 
          name={isTracking ? "stop" : "play-arrow"} 
          size={24} 
          color="#FFFFFF" 
        />
        <Text style={[styles.actionText, { color: '#FFFFFF' }]}>{isTracking ? 'Stop' : 'Start'}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={[styles.actionButton, styles.actionButtonShare]}>
        <MaterialIcons 
          name="share" 
          size={24} 
          color="#1D1B20" 
        />
        <Text style={[styles.actionText, { color: '#1D1B20' }]}>Share live location</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
    flex: 1,
  },
  actionButtonStart: {
    backgroundColor: '#1D1B20',
  },
  actionButtonActive: {
    backgroundColor: '#FF4444',
  },
  actionButtonShare: {
    backgroundColor: '#F0F0F0',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
});

export default ActionButtons;
