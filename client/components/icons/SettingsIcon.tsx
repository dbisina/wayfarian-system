import React from 'react';
import {
  Image,
  StyleSheet,
} from 'react-native';

const SettingsIcon = () => {
  return (
    <Image
      source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/6OPvOsGuWN.svg' }}
      style={styles.icon}
    />
  );
};

const styles = StyleSheet.create({
  icon: {
    width: 20.1,
    height: 20,
    tintColor: '#1D1B20',
  },
});

export default SettingsIcon;
