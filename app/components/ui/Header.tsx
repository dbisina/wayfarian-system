import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface HeaderProps {
  onSettingsPress?: () => void;
  title?: string;
}

const Header = ({ onSettingsPress, title = 'Groups' }: HeaderProps): React.JSX.Element => {
  return (
    <View style={styles.container}>
      <View style={styles.avatar} />
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <TouchableOpacity style={styles.settingsButton} onPress={onSettingsPress}>
        <MaterialIcons name="settings" size={20.1} color="#1D1B20" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 27,
    paddingBottom: 11,
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D9D9D9',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingRight: 48,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 23,
  },
  settingsButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Header;
