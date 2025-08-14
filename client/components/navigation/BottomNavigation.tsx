import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import CustomIcon from '../ui/CustomIcon';

interface BottomNavigationProps {
  activeTab?: 'home' | 'map' | 'stats' | 'leaderboard' | 'groups' | 'camera' | 'profile';
}

const BottomNavigation = ({ activeTab = 'home' }: BottomNavigationProps) => {
  const getTabStyle = (tabName: string) => {
    return activeTab === tabName ? styles.activeTab : styles.tab;
  };

  const getIconColor = (tabName: string) => {
    return activeTab === tabName ? '#000000' : '#757575';
  };

  const getTextStyle = (tabName: string) => {
    return activeTab === tabName ? styles.activeTabText : styles.tabText;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={getTabStyle('home')}>
        <CustomIcon name="home" size={24} color={getIconColor('home')} />
        <Text style={getTextStyle('home')}>Home</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={getTabStyle('map')}>
        <CustomIcon name="map" size={24} color={getIconColor('map')} />
        <Text style={getTextStyle('map')}>Map</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={getTabStyle('stats')}>
        <CustomIcon name="stats" size={24} color={getIconColor('stats')} />
        <Text style={getTextStyle('stats')}>Stats</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={getTabStyle('leaderboard')}>
        <CustomIcon name="leaderboard" size={24} color={getIconColor('leaderboard')} />
        <Text style={getTextStyle('leaderboard')}>Leaderboard</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={getTabStyle('groups')}>
        <CustomIcon name="groups" size={24} color={getIconColor('groups')} />
        <Text style={getTextStyle('groups')}>Groups</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={getTabStyle('camera')}>
        <CustomIcon name="home" size={24} color={getIconColor('camera')} />
      </TouchableOpacity>
      
      <TouchableOpacity style={getTabStyle('profile')}>
        <CustomIcon name="groups" size={24} color={getIconColor('profile')} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 22,
    left: 22,
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 6.5,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 1,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  activeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 8,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2.2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  activeTabText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
});

export default BottomNavigation;
