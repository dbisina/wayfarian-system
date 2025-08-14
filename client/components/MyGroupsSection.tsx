import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import GroupItem from './GroupItem';

const MyGroupsSection = (): JSX.Element => {
  const groups = [
    {
      id: '1',
      name: 'Road Trip Crew',
      memberCount: 4,
      iconUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/wwLPwWBntk.svg',
    },
    {
      id: '2',
      name: 'Weekend Warriors',
      memberCount: 2,
      iconUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/7XEpXYCa5V.svg',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.sectionTitle}>My Groups</Text>
      </View>
      
      <View style={styles.groupsList}>
        {groups.map((group) => (
          <GroupItem
            key={group.id}
            name={group.name}
            memberCount={group.memberCount}
            iconUrl={group.iconUrl}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    color: '#000000',
  },
  groupsList: {
    backgroundColor: '#FFFFFF',
  },
});

export default MyGroupsSection;
