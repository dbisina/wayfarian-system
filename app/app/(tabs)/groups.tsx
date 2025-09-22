import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import GroupCard from '../../components/ui/GroupCard';

export default function GroupsScreen(): React.JSX.Element {
  const myGroups = [
    {
      id: '1',
      name: 'Road Trip Crew',
      memberCount: 4,
      icon: 'people',
    },
    {
      id: '2',
      name: 'Weekend Warriors',
      memberCount: 2,
      icon: 'people',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.myGroupsSection}>
          <View style={styles.groupsList}>
            {myGroups.map((group) => (
              <GroupCard
                key={group.id}
                name={group.name}
                memberCount={group.memberCount}
                icon={group.icon}
                onPress={() => router.push('/group-detail')}
              />
            ))}
          </View>
        </View>

        <View style={styles.createJoinSection}>
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.createButton} onPress={() => router.push('/new-group')}>
              <Text style={styles.createButtonText}>Create Group</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.joinButton}>
              <Text style={styles.joinButtonText}>Join Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  myGroupsSection: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  groupsList: {
    gap: 0,
  },
  createJoinSection: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  createButton: {
    width: 181,
    height: 40,
    backgroundColor: '#F9A825',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
  joinButton: {
    width: 165,
    height: 40,
    backgroundColor: '#3E4751',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
});

