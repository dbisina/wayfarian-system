import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';



type Props = {
  activeTab: 'home' | 'map' | 'journey' | 'log';
  onTabPress?: (tab: Props['activeTab']) => void;
};

const BottomNavigation: React.FC<Props> = ({ activeTab, onTabPress }) => {
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const router = useRouter();

  const handleAddButtonPress = () => {
    setIsMenuExpanded(!isMenuExpanded);
  };

  const handleOverlayPress = () => {
    setIsMenuExpanded(false);
  };

  const handleMenuItemPress = (action: 'add-vehicle' | 'join-group') => {
    setIsMenuExpanded(false);
    if (action === 'join-group') {
      // Navigate to groups via secondary nav
      router.push('/groups');
    }
    // Add more actions here as needed
  };

  return (
    <>
      <Modal
        visible={isMenuExpanded}
        transparent
        animationType="fade"
        onRequestClose={handleOverlayPress}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleOverlayPress}>
          <View style={styles.expandedMenuContainer}>
            <View style={styles.expandedMenu}>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuItemPress('add-vehicle')}>
                <View style={styles.menuItemIcon}>
                  <BikeIcon />
                </View>
                <Text style={styles.menuItemText}>Add a bike/vehicle</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => handleMenuItemPress('join-group')}>
                <View style={styles.menuItemIcon}>
                  <GroupIcon />
                </View>
                <Text style={styles.menuItemText}>Join a group ride</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.expandedAddButton} onPress={handleAddButtonPress}>
              <View style={styles.expandedAddButtonBackground}>
                <AddIcon />
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.navBackground}>
          <TouchableOpacity style={styles.tabButton} onPress={() => onTabPress?.('home')}>
            <View style={styles.iconContainer}>
              <HomeIcon active={activeTab === 'home'} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabButton} onPress={() => onTabPress?.('map')}>
            <View style={styles.iconContainer}>
              <MapIcon active={activeTab === 'map'} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addButton} onPress={handleAddButtonPress}>
            <View style={styles.addButtonBackground}>
              <AddIcon />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabButton} onPress={() => onTabPress?.('journey')}>
            <View style={styles.iconContainer}>
              <JourneyIcon active={activeTab === 'journey'} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logButton} onPress={() => onTabPress?.('log')}>
            <View style={[styles.logButtonBackground, activeTab === 'log' && styles.logButtonActive]}>
              <BarChartIcon active={activeTab === 'log'} />
              <Text style={styles.logText}>Log</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

const HomeIcon = ({ active }: { active: boolean }) => (
  <View style={styles.icon}>
    <View style={[styles.iconShape, { backgroundColor: 'transparent' }]}>
      <View style={[styles.homeIconShape, { borderColor: active ? '#F9A825' : '#666' }]} />
      <View style={[styles.homeIconRoof, { borderBottomColor: active ? '#F9A825' : '#666' }]} />
    </View>
  </View>
);

const MapIcon = ({ active }: { active: boolean }) => (
  <View style={styles.icon}>
    <View style={[styles.mapIconContainer, { borderColor: active ? '#F9A825' : '#666' }]}>
      <View style={[styles.mapIconPin, { backgroundColor: active ? '#F9A825' : '#666' }]} />
      <View style={[styles.mapIconBase, { backgroundColor: active ? '#F9A825' : '#666' }]} />
    </View>
  </View>
);

const AddIcon = () => (
  <View style={styles.addIconContainer}>
    <View style={styles.addIconHorizontal} />
    <View style={styles.addIconVertical} />
  </View>
);

const JourneyIcon = ({ active }: { active: boolean }) => (
  <View style={styles.icon}>
    <View style={styles.journeyIconContainer}>
      <View style={[styles.journeyIconDot, { backgroundColor: active ? '#F9A825' : '#666' }]} />
      <View style={[styles.journeyIconLine, { backgroundColor: active ? '#F9A825' : '#666' }]} />
      <View style={[styles.journeyIconDot, { backgroundColor: active ? '#F9A825' : '#666' }]} />
    </View>
  </View>
);

const BarChartIcon = ({ active }: { active: boolean }) => (
  <View style={styles.barChartContainer}>
    <View style={[styles.bar, styles.bar1, { backgroundColor: active ? '#000' : '#666' }]} />
    <View style={[styles.bar, styles.bar2, { backgroundColor: active ? '#000' : '#666' }]} />
    <View style={[styles.bar, styles.bar3, { backgroundColor: active ? '#000' : '#666' }]} />
    <View style={[styles.bar, styles.bar4, { backgroundColor: active ? '#000' : '#666' }]} />
  </View>
);

const BikeIcon = () => (
  <View style={styles.bikeIconContainer}>
    <View style={styles.bikeWheel} />
    <View style={styles.bikeFrame} />
    <View style={styles.bikeWheel2} />
  </View>
);

const GroupIcon = () => (
  <View style={styles.groupIconContainer}>
    <View style={styles.groupPerson1} />
    <View style={styles.groupPerson2} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 29,
    left: 20,
    right: 20,
    height: 50,
    zIndex: 1000,
  },
  navBackground: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
  },
  tabButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconContainer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  addButton: { position: 'absolute', left: '50%', marginLeft: -17.5, top: -21.5, width: 35, height: 35, alignItems: 'center', justifyContent: 'center' },
  addButtonBackground: { width: 35, height: 35, backgroundColor: '#F9A825', borderRadius: 17.5, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  logButton: { alignItems: 'center', justifyContent: 'center' },
  logButtonBackground: { backgroundColor: 'rgba(250, 250, 250, 0.6)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2.2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  logButtonActive: { backgroundColor: 'rgba(249, 168, 37, 0.2)' },
  logText: { fontSize: 12, lineHeight: 18, color: '#000', fontWeight: '400' },
  iconShape: { width: 20, height: 16, position: 'relative' },
  homeIconShape: { position: 'absolute', bottom: 0, left: 2, width: 16, height: 12, backgroundColor: 'transparent', borderWidth: 2 },
  homeIconRoof: { position: 'absolute', top: 0, left: 0, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  mapIconContainer: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  mapIconPin: { width: 6, height: 6, borderRadius: 3, position: 'absolute', top: 4 },
  mapIconBase: { width: 2, height: 6, position: 'absolute', bottom: 4 },
  addIconContainer: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  addIconHorizontal: { position: 'absolute', width: 12, height: 2, backgroundColor: '#000', borderRadius: 1 },
  addIconVertical: { position: 'absolute', width: 2, height: 12, backgroundColor: '#000', borderRadius: 1 },
  journeyIconContainer: { width: 20, height: 20, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'column', paddingVertical: 2 },
  journeyIconDot: { width: 4, height: 4, borderRadius: 2 },
  journeyIconLine: { width: 2, height: 8, borderRadius: 1 },
  barChartContainer: { width: 20, height: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 2 },
  bar: { width: 3, borderRadius: 1.5 },
  bar1: { height: 8 },
  bar2: { height: 12 },
  bar3: { height: 6 },
  bar4: { height: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.82)', justifyContent: 'flex-end', alignItems: 'center' },
  expandedMenuContainer: { position: 'relative', alignItems: 'center', marginBottom: 100 },
  expandedMenu: { width: 193, height: 130, backgroundColor: '#FFFFFF', borderRadius: 15, paddingVertical: 20, paddingHorizontal: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 8, justifyContent: 'space-around' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  menuItemIcon: { width: 16, height: 16, backgroundColor: '#F9A825', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuItemText: { fontSize: 6, lineHeight: 9, color: '#000', fontWeight: '400' },
  expandedAddButton: { position: 'absolute', bottom: -17.5, width: 35, height: 35, alignItems: 'center', justifyContent: 'center' },
  expandedAddButtonBackground: { width: 35, height: 35, backgroundColor: '#F9A825', borderRadius: 17.5, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  bikeIconContainer: { width: 8, height: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bikeWheel: { width: 2, height: 2, borderRadius: 1, backgroundColor: '#000' },
  bikeFrame: { width: 3, height: 1, backgroundColor: '#000' },
  bikeWheel2: { width: 2, height: 2, borderRadius: 1, backgroundColor: '#000' },
  groupIconContainer: { width: 8, height: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  groupPerson1: { width: 3, height: 6, backgroundColor: '#000', borderRadius: 1.5, marginRight: 1 },
  groupPerson2: { width: 3, height: 6, backgroundColor: '#000', borderRadius: 1.5, marginLeft: 1 },
});

export default BottomNavigation;
