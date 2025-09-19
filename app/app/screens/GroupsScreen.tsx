import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Header from '../components/Header';
import BottomNavigation from '../components/BottomNavigation';
import GroupCard from '../components/GroupCard';

interface GroupsScreenProps {
  onTabPress?: (tab: string) => void;
  onCreateGroup?: () => void;
  onGroupDetail?: () => void;
}

const GroupsScreen = ({onTabPress, onCreateGroup, onGroupDetail}: GroupsScreenProps): React.ReactElement => {
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
      <Header title="Groups" />
      <View style={styles.content}>
        <View style={styles.myGroupsSection}>
          <Text style={styles.sectionTitle}>My Groups</Text>
          
          <View style={styles.groupsList}>
            {myGroups.map((group) => (
              <GroupCard
                key={group.id}
                name={group.name}
                memberCount={group.memberCount}
                icon={group.icon}
                onPress={onGroupDetail}
              />
            ))}
          </View>
        </View>

        <View style={styles.createJoinSection}>
          <Text style={styles.sectionTitle}>Create or Join</Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.createButton} onPress={onCreateGroup}>
              <Text style={styles.createButtonText}>Create Group</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.joinButton}>
              <Text style={styles.joinButtonText}>Join Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <BottomNavigation activeTab="people" onTabPress={onTabPress} />
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
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 28,
    marginBottom: 12,
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

export default GroupsScreen;
