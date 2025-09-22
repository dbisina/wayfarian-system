import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface GroupCardProps {
  name: string;
  memberCount: number;
  icon: string;
  onPress?: () => void;
}

const GroupCard = ({name, memberCount, icon, onPress}: GroupCardProps): React.JSX.Element => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Icon name={icon} size={24} color="#FFFFFF" />
      </View>
      
      <View style={styles.content}>
        <Text style={styles.groupName}>{name}</Text>
        <Text style={styles.memberCount}>
          {memberCount} member{memberCount !== 1 ? 's' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 16,
    height: 72,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#3E4751',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  groupName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
  memberCount: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8FADCC',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
});

export default GroupCard;
