// app/components/VehicleCard.tsx
// Compact card for displaying a garage vehicle

import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GarageVehicle } from '../services/api';

const VEHICLE_ICONS: Record<string, string> = {
  car: '🚗',
  bike: '🚲',
  motorcycle: '🏍️',
  scooter: '🛵',
  truck: '🚚',
  van: '🚐',
};

interface VehicleCardProps {
  vehicle: GarageVehicle;
  selected?: boolean;
  compact?: boolean;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetDefault?: () => void;
}

export default function VehicleCard({
  vehicle,
  selected = false,
  compact = false,
  onPress,
  onEdit,
  onDelete,
  onSetDefault,
}: VehicleCardProps) {
  const emoji = VEHICLE_ICONS[vehicle.type] ?? '🚗';

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactCard, selected && styles.compactCardSelected]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {vehicle.photoURL ? (
          <Image source={{ uri: vehicle.photoURL }} style={styles.compactPhoto} />
        ) : (
          <View style={[styles.compactPhotoPlaceholder, selected && styles.compactPhotoPlaceholderSelected]}>
            <Text style={styles.compactEmoji}>{emoji}</Text>
          </View>
        )}
        <View style={styles.compactInfo}>
          <Text style={[styles.compactName, selected && styles.compactNameSelected]} numberOfLines={1}>
            {vehicle.name}
          </Text>
          <Text style={styles.compactSub} numberOfLines={1}>
            {vehicle.make} {vehicle.model}
            {vehicle.year ? ` · ${vehicle.year}` : ''}
          </Text>
        </View>
        {selected && <Ionicons name="checkmark-circle" size={22} color="#F9A825" />}
        {vehicle.isDefault && !selected && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Photo / placeholder */}
      {vehicle.photoURL ? (
        <Image source={{ uri: vehicle.photoURL }} style={styles.photo} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{vehicle.name}</Text>
          {vehicle.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        <Text style={styles.sub}>
          {vehicle.make} {vehicle.model}
          {vehicle.year ? ` · ${vehicle.year}` : ''}
          {vehicle.color ? ` · ${vehicle.color}` : ''}
        </Text>
      </View>

      {/* Actions */}
      {(onEdit || onDelete || onSetDefault) && (
        <View style={styles.actions}>
          {onSetDefault && !vehicle.isDefault && (
            <TouchableOpacity onPress={onSetDefault} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="star-outline" size={20} color="#F9A825" />
            </TouchableOpacity>
          )}
          {onEdit && (
            <TouchableOpacity onPress={onEdit} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={20} color="#757575" />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity onPress={onDelete} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={20} color="#EF5350" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardSelected: {
    borderColor: '#F9A825',
    backgroundColor: 'rgba(249, 168, 37, 0.04)',
  },
  photo: {
    width: 64,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    width: 64,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  info: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#000', flex: 1 },
  sub: { fontSize: 13, color: '#757575' },
  defaultBadge: {
    backgroundColor: 'rgba(249, 168, 37, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '600', color: '#F9A825' },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6 },

  // Compact styles
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 10,
  },
  compactCardSelected: { borderColor: '#F9A825', backgroundColor: 'rgba(249, 168, 37, 0.06)' },
  compactPhoto: { width: 42, height: 32, borderRadius: 8, resizeMode: 'cover' },
  compactPhotoPlaceholder: {
    width: 42,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPhotoPlaceholderSelected: { backgroundColor: 'rgba(249, 168, 37, 0.1)' },
  compactEmoji: { fontSize: 20 },
  compactInfo: { flex: 1 },
  compactName: { fontSize: 14, fontWeight: '600', color: '#000' },
  compactNameSelected: { color: '#E65100' },
  compactSub: { fontSize: 12, color: '#9E9E9E', marginTop: 1 },
});
