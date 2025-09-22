import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
// import MapView, {Marker, PROVIDER_GOOGLE} from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

const {width, height} = Dimensions.get('window');

interface CategoryFilter {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

interface MapLocation {
  id: string;
  title: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  category: string;
}

export default function MapScreen(): React.JSX.Element {
  const [searchText, setSearchText] = useState('');
  const [categories, setCategories] = useState<CategoryFilter[]>([
    {id: 'gas', name: 'Gas', icon: 'local-gas-station', active: false},
    {id: 'hotel', name: 'Hotel', icon: 'hotel', active: false},
    {id: 'restaurant', name: 'Restaurant', icon: 'restaurant', active: false},
    {id: 'attractions', name: 'Attractions', icon: 'place', active: false},
    {id: 'shopping', name: 'Shopping', icon: 'shopping-cart', active: false},
  ]);

  const [locations] = useState<MapLocation[]>([
    {
      id: '1',
      title: 'Golden Gate Bridge',
      coordinate: {latitude: 37.8199, longitude: -122.4783},
      category: 'attractions',
    },
    {
      id: '2',
      title: 'Fisherman\'s Wharf',
      coordinate: {latitude: 37.8080, longitude: -122.4177},
      category: 'attractions',
    },
    {
      id: '3',
      title: 'Union Square',
      coordinate: {latitude: 37.7879, longitude: -122.4075},
      category: 'shopping',
    },
    {
      id: '4',
      title: 'Chinatown',
      coordinate: {latitude: 37.7941, longitude: -122.4078},
      category: 'restaurant',
    },
    {
      id: '5',
      title: 'Lombard Street',
      coordinate: {latitude: 37.8021, longitude: -122.4187},
      category: 'attractions',
    },
  ]);

  const sanFranciscoRegion = {
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  const toggleCategory = (categoryId: string) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId ? {...cat, active: !cat.active} : cat,
      ),
    );
  };

  const getFilteredLocations = () => {
    const activeCategories = categories
      .filter(cat => cat.active)
      .map(cat => cat.id);
    
    if (activeCategories.length === 0) {
      return locations;
    }
    
    return locations.filter(location =>
      activeCategories.includes(location.category),
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#757575" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search places..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#757575"
          />
        </View>
      </View>

      {/* Category Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}>
          {categories.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.filterChip,
                category.active && styles.filterChipActive,
              ]}
              onPress={() => toggleCategory(category.id)}>
              <MaterialIcons
                name={category.icon as any}
                size={16}
                color={category.active ? '#FFFFFF' : '#757575'}
                style={styles.filterIcon}
              />
              <Text
                style={[
                  styles.filterText,
                  category.active && styles.filterTextActive,
                ]}>
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {/* MapView temporarily disabled - requires react-native-maps package */}
        <View style={styles.map}>
          <Text style={{textAlign: 'center', marginTop: 100, fontSize: 16}}>
            Map View - Requires react-native-maps package
          </Text>
        </View>

        {/* Location Button */}
        <TouchableOpacity style={styles.locationButton}>
          <MaterialIcons name="my-location" size={24} color="#000000" />
        </TouchableOpacity>

        {/* Navigation Button */}
        <TouchableOpacity style={styles.navigationButton}>
          <MaterialIcons name="navigation" size={24} color="#000000" />
        </TouchableOpacity>

        {/* Start Journey Button */}
        <TouchableOpacity 
          style={styles.startJourneyButton}
          onPress={() => router.push('/new-journey')}
        >
          <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
          <Text style={styles.startJourneyText}>Start Journey</Text>
        </TouchableOpacity>
      </View>

      {/* Highway Labels (Static for demo) */}
      <View style={styles.highwayLabel80}>
        <Text style={styles.highwayText}>80</Text>
      </View>
      
      <View style={styles.highwayLabel280}>
        <Text style={styles.highwayText}>280</Text>
      </View>

      <View style={styles.highwayLabel101}>
        <Text style={styles.highwayText}>101</Text>
      </View>

      <View style={styles.highwayLabel1}>
        <Text style={styles.highwayText}>1</Text>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  searchContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
  },
  filtersContainer: {
    position: 'absolute',
    top: 110,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  filtersContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterChipActive: {
    backgroundColor: '#4A90E2',
  },
  filterIcon: {
    marginRight: 5,
  },
  filterText: {
    fontSize: 14,
    color: '#757575',
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  mapContainer: {
    flex: 1,
    marginTop: 170,
  },
  map: {
    flex: 1,
  },
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  navigationButton: {
    position: 'absolute',
    bottom: 180,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  highwayLabel80: {
    position: 'absolute',
    top: height * 0.3,
    right: 30,
    backgroundColor: '#4A90E2',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 998,
  },
  highwayLabel280: {
    position: 'absolute',
    bottom: height * 0.35,
    left: 40,
    backgroundColor: '#4A90E2',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 998,
  },
  highwayLabel101: {
    position: 'absolute',
    bottom: height * 0.25,
    right: width * 0.3,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#000000',
    zIndex: 998,
  },
  highwayLabel1: {
    position: 'absolute',
    top: height * 0.45,
    left: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
    zIndex: 998,
  },
  highwayText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
  },
  startJourneyButton: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(62, 71, 81, 0.9)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  startJourneyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
  },
});

