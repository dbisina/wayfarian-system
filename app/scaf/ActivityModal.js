import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { router } from 'expo-router';

const ActivityModal = ({ visible, onClose, anchorBottom = 85 }) => {
  const activities = [
    {
      id: 1,
      title: 'Start Solo ride',
      icon: require('../assets/images/2025-10-15/4FyvdMbYua.png'),
      iconBg: require('../assets/images/2025-10-15/BwUbV4i6JS.png'),
    },
    {
      id: 2,
      title: 'Scheduled Ride',
      icon: require('../assets/images/2025-10-15/4MPiLO8s20.png'),
      iconBg: null,
    },
    {
      id: 3,
      title: 'Start Group ride',
      icon: require('../assets/images/2025-10-15/NDub6kiVWF.png'),
      iconBg: require('../assets/images/2025-10-15/BwUbV4i6JS.png'),
    },
    {
      id: 4,
      title: 'Join a group ride',
      icon: require('../assets/images/2025-10-15/2B62N8nM0F.png'),
      iconBg: null,
    },
    {
      id: 5,
      title: 'Start a Challenge',
      icon: require('../assets/images/2025-10-15/Gn7fFDATEF.png'),
      iconBg: null,
    },
  ];

  const handleActivityPress = (activity) => {
    try {
      // Route based on selected activity; keep UI unchanged
      switch (activity.id) {
        case 1: // Start Solo ride
          router.push('/new-journey');
          break;
        case 2: // Scheduled Ride
          router.push('/future-rides');
          break;
        case 3: // Start Group ride
          router.push('/new-group');
          break;
        case 4: // Join a group ride
          router.push('/groups');
          break;
        default:
          // Other actions can be hooked up later
          break;
      }
    } finally {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.absoluteContainer} pointerEvents="box-none">
      {/* Dimmed backdrop (kept below FAB via zIndex) */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Modal content wrapper: bottom-centered just above the FAB */}
      <View style={[styles.modalContainer, { paddingBottom: anchorBottom }]} pointerEvents="box-none">
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.bubbleContainer}>
            <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Activity type</Text>

            <View style={styles.activitiesContainer}>
              <View style={styles.leftColumn}>
                {activities.slice(0, 3).map((activity) => (
                  <TouchableOpacity
                    key={activity.id}
                    style={styles.activityItem}
                    onPress={() => handleActivityPress(activity)}
                  >
                    <View style={styles.iconContainer}>
                      {activity.iconBg && (
                        <Image
                          source={activity.iconBg}
                          style={styles.iconBackground}
                        />
                      )}
                      <Image
                        source={activity.icon}
                        style={styles.activityIcon}
                      />
                    </View>
                    <Text style={styles.activityText}>{activity.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.rightColumn}>
                {activities.slice(3).map((activity) => (
                  <TouchableOpacity
                    key={activity.id}
                    style={styles.activityItem}
                    onPress={() => handleActivityPress(activity)}
                  >
                    <View style={styles.iconContainer}>
                      {activity.iconBg && (
                        <Image
                          source={activity.iconBg}
                          style={styles.iconBackground}
                        />
                      )}
                      <Image
                        source={activity.icon}
                        style={styles.activityIcon}
                      />
                    </View>
                    <Text style={styles.activityText}>{activity.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.pointerTriangle} />
          </View>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  absoluteContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    zIndex: 11,
  },
  modalContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 12,
  },
  modalContent: {
    width: 230,
    height: 155,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleContainer: {
    alignItems: 'center',
  },
  pointerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    alignSelf: 'center',
  },
  modalTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 15.31,
    marginBottom: 8,
  },
  activitiesContainer: {
    flexDirection: 'row',
    flex: 1,
    gap: 12,
  },
  leftColumn: {
    flex: 1,
    gap: 8,
  },
  rightColumn: {
    flex: 1,
    gap: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  iconContainer: {
    width: 20,
    height: 18,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBackground: {
    position: 'absolute',
    width: 20,
    height: 18,
  },
  activityIcon: {
    width: 10,
    height: 10,
    zIndex: 1,
  },
  activityText: {
    fontSize: 8,
    lineHeight: 11,
    color: '#000000',
    flex: 1,
  },
});

export default ActivityModal;
