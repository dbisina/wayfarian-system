import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const MapScreen = () => {
  return (
    <View style={styles.container}>
      {/* Background Map */}
      <Image
        source={require('../assets/images/2025-09-26/WgHiEt253Q.png')}
        style={styles.mapBackground}
        resizeMode="cover"
      />

      {/* Search Bar */}
      <View style={styles.searchBar} />

      {/* Filter Buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterText}>Gas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterText}>Hotel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterText}>Restaurant</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterText}>Attractions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterText}>Shopping</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Action Buttons */}
      <TouchableOpacity style={[styles.floatingButton, styles.floatingButton1]}>
        <Image
          source={require('../assets/images/2025-09-26/NydH8KLPYS.png')}
          style={styles.floatingButtonImage}
        />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.floatingButton, styles.floatingButton2]}>
        <Image
          source={require('../assets/images/2025-09-26/4BNFvkcOE2.png')}
          style={styles.floatingButtonImage}
        />
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity style={styles.navItem}>
          <Image
            source={require('../assets/images/2025-10-15/y2W4CRNORb.png')}
            style={styles.navIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.activeNavItem}>
          <Image
            source={require('../assets/images/2025-10-15/1bd3DwwpQG.png')}
            style={styles.navIcon}
          />
          <Text style={styles.activeNavText}>Map</Text>
        </TouchableOpacity>

        {/* Floating Center Button */}
        <View style={styles.floatingButtonContainer}>
          <TouchableOpacity style={styles.floatingButton}>
            <Image
              source={require('../assets/images/2025-10-15/O3x1a5Ka2Y.png')}
              style={styles.floatingIcon}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.navItem}>
          <Image
            source={require('../assets/images/2025-10-15/g0HQMrSGro.png')}
            style={styles.navIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Image
            source={require('../assets/images/2025-10-15/tQcweNppVu.png')}
            style={styles.navIcon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapBackground: {
    position: 'absolute',
    width: screenWidth + 489, // 879px width from Figma, offset by -262px
    height: 879,
    left: -262,
    top: 0,
  },
  searchBar: {
    position: 'absolute',
    top: 28,
    left: 15,
    right: 15,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  filterContainer: {
    position: 'absolute',
    top: 91,
    left: 15,
    right: 15,
    height: 22,
  },
  filterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  filterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
    height: 22,
  },
  filterText: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: '#000000',
  },
  floatingButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    right: 22,
  },
  floatingButton1: {
    top: 637,
  },
  floatingButton2: {
    top: 697,
  },
  floatingButtonImage: {
    width: 50,
    height: 50,
  },
  bottomNavigation: {
    position: 'absolute',
    bottom: 29,
    left: 20,
    right: 20,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 31,
  },
  navItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeNavItem: {
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2.2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  navIcon: {
    width: 24,
    height: 24,
  },
  activeNavText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
  },
  floatingButtonContainer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -17.5,
    top: -7.5,
  },
  floatingButton: {
    width: 35,
    height: 35,
    backgroundColor: '#E4fAmovyMS',
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingIcon: {
    width: 16,
    height: 16,
  },
});

export default MapScreen;
