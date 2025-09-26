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
        source={{ uri: 'https://static.codia.ai/image/2025-09-26/WgHiEt253Q.png' }}
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
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/NydH8KLPYS.png' }}
          style={styles.floatingButtonImage}
        />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.floatingButton, styles.floatingButton2]}>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/4BNFvkcOE2.png' }}
          style={styles.floatingButtonImage}
        />
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/o5BUk9vdvW.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.activeNavItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/acZPnbq31G.png' }}
            style={styles.navIcon}
          />
          <Text style={styles.activeNavText}>Map</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/s3XYiRcD5T.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/L2UkYbgM22.png' }}
            style={styles.navIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/hc2W5pxgO7.png' }}
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
    bottom: 31, // 844 - 763 - 50 = 31
    left: 22,
    right: 22,
    height: 50,
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 1,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  navItem: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 33,
  },
  activeNavItem: {
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 33,
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
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: '#000000',
    marginLeft: 7,
  },
});

export default MapScreen;
