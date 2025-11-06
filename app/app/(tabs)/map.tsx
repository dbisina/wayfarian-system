import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, FlatList, Keyboard, Image } from 'react-native';
import { router } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { placesAPI } from '../../services/api';
import { Skeleton, SkeletonLine, SkeletonCircle } from '../../components/Skeleton';
import { Feather } from '@expo/vector-icons';

// const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string;
  rating?: number;
}

export default function MapScreen(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const mapRef = useRef<MapView | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('gas');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<{ latitude: number; longitude: number; name?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; description: string; placeId: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterTypes = useMemo(() => [
    { key: 'gas', serverType: 'gas_station', label: 'Gas' },
    { key: 'lodging', serverType: 'lodging', label: 'Hotel' },
    { key: 'restaurant', serverType: 'restaurant', label: 'Restaurant' },
    { key: 'tourist_attraction', serverType: 'tourist_attraction', label: 'Attractions' },
    { key: 'shopping_mall', serverType: 'shopping_mall', label: 'Shopping' },
  ], []);

  const getMockPlaces = useCallback((): Place[] => {
    if (!location) return [];
    return [
      {
        id: '1',
        name: 'Shell Gas Station',
        latitude: location.coords.latitude + 0.01,
        longitude: location.coords.longitude + 0.01,
        type: 'gas',
        rating: 4.2,
      },
      {
        id: '2',
        name: "McDonald's",
        latitude: location.coords.latitude - 0.005,
        longitude: location.coords.longitude + 0.008,
        type: 'restaurant',
        rating: 4.0,
      },
      {
        id: '3',
        name: 'Holiday Inn',
        latitude: location.coords.latitude + 0.008,
        longitude: location.coords.longitude - 0.012,
        type: 'lodging',
        rating: 4.5,
      },
    ];
  }, [location]);

  useEffect(() => {
    getCurrentLocation();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setError('Location permission denied');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      setLocation(currentLocation);
    } catch (error: any) {
      setError('Failed to get current location');
      console.error('Location error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbyPlaces = useCallback(async () => {
    if (!location) return;

    try {
      setLoading(true);
      const serverType = filterTypes.find(f => f.key === selectedFilter)?.serverType || 'point_of_interest';
      const response = await placesAPI.searchNearby({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        type: serverType,
        radius: 5000, // 5km radius
      });

      if (response?.places) {
        const formattedPlaces = response.places.map((p: any) => ({
          id: p.id || p.place_id || String(Math.random()),
          name: p.name || 'Unknown',
          latitude: p.latitude || p.geometry?.location?.lat || 0,
          longitude: p.longitude || p.geometry?.location?.lng || 0,
          type: selectedFilter,
          rating: p.rating || undefined,
        }));
        setPlaces(formattedPlaces);
      }
    } catch (error: any) {
      console.error('Places fetch error:', error);
      // Fallback to mock data if API fails
      setPlaces(getMockPlaces());
    } finally {
      setLoading(false);
    }
  }, [location, selectedFilter, filterTypes, getMockPlaces]);

  useEffect(() => {
    if (location && isAuthenticated) {
      fetchNearbyPlaces();
    }
  }, [location, selectedFilter, isAuthenticated, fetchNearbyPlaces]);



  const handleStartJourney = () => {
    if (!isAuthenticated) {
      Alert.alert('Authentication Required', 'Please log in to start a journey');
      return;
    }
    router.push('/new-journey');
  };

  const handleFilterPress = (filterKey: string) => {
    setSelectedFilter(filterKey);
  };

  const animateToRegion = (region: Region) => {
    mapRef.current?.animateToRegion(region, 600);
  };

  const handleSearchSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    try {
      setLoading(true);
      setSuggestions([]);
      Keyboard.dismiss();
      const result = await placesAPI.geocode(trimmed);
      // Server returns { success, result: { location: { latitude, longitude }, formattedAddress } }
      const lat = result?.result?.location?.latitude;
      const lng = result?.result?.location?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        const region: Region = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.02,
        };
        setDestination({ latitude: lat, longitude: lng, name: result?.result?.formattedAddress || trimmed });
        animateToRegion(region);
      } else {
        Alert.alert('Not found', 'Could not locate that destination.');
      }
    } catch {
      Alert.alert('Error', 'Failed to search location.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAutocomplete = async (text: string) => {
    try {
      const params: any = { input: text };
      if (location) {
        params.latitude = location.coords.latitude;
        params.longitude = location.coords.longitude;
      }
      const res = await placesAPI.autocomplete(params);
      const items = (res?.predictions || []).map((p: any) => ({ id: p.placeId, placeId: p.placeId, description: p.description }));
      setSuggestions(items);
    } catch {
      // Non-fatal - just clear suggestions on error
      setSuggestions([]);
    }
  };

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => fetchAutocomplete(text.trim()), 250);
  };

  const handlePickSuggestion = async (placeId: string, description: string) => {
    try {
      setLoading(true);
      Keyboard.dismiss();
      const details = await placesAPI.placeDetails(placeId);
      const lat = details?.place?.location?.latitude;
      const lng = details?.place?.location?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        const region: Region = { latitude: lat, longitude: lng, latitudeDelta: 0.04, longitudeDelta: 0.02 };
        setDestination({ latitude: lat, longitude: lng, name: details?.place?.address || description });
        animateToRegion(region);
        setSuggestions([]);
        setQuery(description);
      }
    } catch {
      Alert.alert('Error', 'Failed to load place details');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Please log in to view the map</Text>
        </View>
      </View>
    );
  }

  if (error && !location) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={getCurrentLocation}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      {location ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          ref={mapRef as any}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {places.map((place) => (
            <Marker
              key={place.id}
              coordinate={{
                latitude: place.latitude,
                longitude: place.longitude,
              }}
              title={place.name}
              description={`Rating: ${place.rating || 'N/A'}`}
            />
          ))}
          {destination && (
            <Marker
              coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
              title={destination.name || 'Destination'}
              pinColor="#F9A825"
            />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Skeleton width={"88%"} height={180} style={{ borderRadius: 12 }} />
          <View style={{ height: 14 }} />
          <SkeletonLine width={"60%"} height={14} />
          <View style={{ height: 10 }} />
          <SkeletonLine width={"40%"} height={12} />
        </View>
      )}

      {/* Lightweight loading badge instead of full overlay */}
      {loading && (
        <View style={styles.loadingBadge}>
          <SkeletonCircle size={14} />
          <View style={{ width: 8 }} />
          <SkeletonLine width={70} height={12} />
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={handleSearchSubmit}
          placeholder="Search destination..."
          returnKeyType="search"
          style={styles.searchInput}
          placeholderTextColor="#666"
        />
        {query.length > 0 && (
          <TouchableOpacity 
            onPress={() => { setQuery(''); setSuggestions([]); }} 
            style={styles.clearBtn}
            accessibilityRole="button"
          >
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleSearchSubmit} accessibilityRole="button">
          <Feather name="search" size={16} color="#fff" />  
        </TouchableOpacity>
    
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={suggestions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionItem} onPress={() => handlePickSuggestion(item.placeId, item.description)}>
                <Text numberOfLines={1} style={styles.suggestionText}>{item.description}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Filter Buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {filterTypes.map((filter) => (
          <TouchableOpacity 
            key={filter.key}
            style={[
              styles.filterButton,
              selectedFilter === filter.key && styles.filterButtonActive
            ]}
            onPress={() => handleFilterPress(filter.key)}
          >
            <Text style={[
              styles.filterText,
              selectedFilter === filter.key && styles.filterTextActive
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={[styles.floatingButton, styles.floatingButton1]} onPress={handleStartJourney}>
              <Image
                source={require('../../assets/images/2025-09-26/NydH8KLPYS.png')}
                style={styles.floatingButtonImage}
              />
            </TouchableOpacity>
      
            <TouchableOpacity style={[styles.floatingButton, styles.floatingButton2]} onPress={getCurrentLocation}>
              <Image
                source={require('../../assets/images/2025-09-26/4BNFvkcOE2.png')}
                style={styles.floatingButtonImage}
              />
            </TouchableOpacity>
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
  },
  loadingBadge: {
    position: "absolute",
    top: 160,
    right: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 900,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    fontFamily: "Space Grotesk",
  },
  searchBar: {
    position: "absolute",
    top: 50,
    left: 15,
    right: 15,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    fontSize: 16,
    color: "#000",
    fontFamily: "Space Grotesk",
  },
  searchIcon: {
    fontSize: 16,
    color: "#fff",
  },
  clearBtn: {
    marginLeft: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  clearIcon: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  locationBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
  },
  locationIcon: {
    fontSize: 16,
  },
  suggestionsBox: {
    position: "absolute",
    top: 102,
    left: 15,
    right: 15,
    maxHeight: 220,
    backgroundColor: "#fff",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: "#eee",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    fontSize: 14,
    color: "#333",
    fontFamily: "Space Grotesk",
  },
  filterContainer: {
    position: "absolute",
    top: 110,
    left: 15,
    right: 15,
    height: 40,
  },
  filterContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterButton: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 32,
  },
  filterButtonActive: {
    backgroundColor: "#F9A825",
  },
  filterText: {
    fontFamily: "Space Grotesk",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    color: "#000000",
  },
  filterTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  floatingButton: {
    position: "absolute",
    width: 50,
    height: 50,
    right: 22,
  },
  floatingButton1: {
    top: 667,
  },
  floatingButton2: {
    top: 727,
  },
  floatingButtonImage: {
    width: 50,
    height: 50,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    fontFamily: "Space Grotesk",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#F9A825",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Space Grotesk",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
});

