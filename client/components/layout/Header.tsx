import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface HeaderProps {
  title?: string;
  showAvatar?: boolean;
  showLogo?: boolean;
  showSettings?: boolean;
  backgroundColor?: string;
  onSettingsPress?: () => void;
}

const Header = ({ 
  title = 'LOGO',
  showAvatar = true,
  showLogo = true,
  showSettings = true,
  backgroundColor = '#F6F6F6',
  onSettingsPress
}: HeaderProps) => {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {showAvatar && <View style={styles.avatar} />}
      {showLogo && (
        <Text style={styles.logo}>{title}</Text>
      )}
      {showSettings && (
        <TouchableOpacity style={styles.settingsButton} onPress={onSettingsPress}>
          <MaterialIcons name="settings" size={24} color="#1D1B20" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 27,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D9D9D9',
  },
  logo: {
    fontSize: 18,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Inter',
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
