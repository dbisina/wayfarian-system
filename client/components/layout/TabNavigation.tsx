import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const TabNavigation = () => {
  const [activeTab, setActiveTab] = useState('Global');

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'Friends' && styles.activeTab]}
        onPress={() => setActiveTab('Friends')}
      >
        <Text style={[styles.tabText, activeTab === 'Friends' && styles.activeTabText]}>
          Friends
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'Global' && styles.activeTab]}
        onPress={() => setActiveTab('Global')}
      >
        <Text style={[styles.tabText, activeTab === 'Global' && styles.activeTabText]}>
          Global
        </Text>
      </TouchableOpacity>
      <View style={styles.underline} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 32,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#214A4A',
  },
  tabText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: '#000000',
  },
  activeTabText: {
    color: '#214A4A',
    fontWeight: '600',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#214A4A',
    width: 195,
  },
});

export default TabNavigation;
