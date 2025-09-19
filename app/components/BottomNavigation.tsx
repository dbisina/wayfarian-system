import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface BottomNavigationProps {
  activeTab?: string;
  onTabPress?: (tab: string) => void;
}

const BottomNavigation = ({activeTab = 'home', onTabPress}: BottomNavigationProps): React.ReactElement => {
  const tabs = [
    {id: 'home', icon: 'home', label: 'Home'},
    {id: 'map', icon: 'map', label: 'Map'},
    {id: 'log', icon: 'bar-chart', label: 'Log'},
    {id: 'trophy', icon: 'emoji-events', label: 'Trophy'},
    {id: 'people', icon: 'people', label: 'Groups'},
  ];

  return (
    <View style={styles.container}>
      <View style={styles.leftTabs}>
        {tabs.slice(0, 4).map((tab) => {
          const isActive = activeTab === tab.id;
          
          return (
            <TouchableOpacity 
              key={tab.id}
              style={styles.tab}
              onPress={() => onTabPress?.(tab.id)}
            >
              <Icon name={tab.icon} size={24} color={isActive ? "#000000" : "#757575"} />
            </TouchableOpacity>
          );
        })}
      </View>
      
      <TouchableOpacity 
        style={styles.activeTab}
        onPress={() => onTabPress?.('people')}
      >
        <Icon name="people" size={24} color="#000000" />
        <Text style={styles.activeTabText}>Groups</Text>
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
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 7,
    gap: 33,
    shadowColor: '#000',
    shadowOffset: {
      width: 1,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    height: 50,
  },
  leftTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 33,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  },
  activeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2.2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    height: 37,
  },
  activeTabText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
});

export default BottomNavigation;
