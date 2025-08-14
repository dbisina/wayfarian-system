import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';

interface GroupItemProps {
  name: string;
  memberCount: number;
  iconUrl: string;
}

const GroupItem = ({ name, memberCount, iconUrl }: GroupItemProps): JSX.Element => {
  return (
    <TouchableOpacity style={styles.container}>
      <View style={styles.iconContainer}>
        <Image source={{ uri: iconUrl }} style={styles.icon} />
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.nameContainer}>
          <Text style={styles.groupName}>{name}</Text>
        </View>
        <View style={styles.memberContainer}>
          <Text style={styles.memberCount}>{memberCount} members</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    minHeight: 72,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#3E4751',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  icon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameContainer: {
    marginBottom: 4,
  },
  groupName: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontWeight: '500',
    fontSize: 16,
    lineHeight: 24,
    color: '#000000',
  },
  memberContainer: {
    marginTop: 4,
  },
  memberCount: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 21,
    color: '#8FADCC',
  },
});

export default GroupItem;
