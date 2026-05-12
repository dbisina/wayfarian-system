import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, FlatList, Keyboard, Platform, Animated, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings, MapType } from '../../contexts/SettingsContext';
import { useJourney } from '../../contexts/JourneyContext';
import { useJourneyStats, useJourneyRoutePoints } from '../../hooks/useJourneyState';
import { placesAPI, userAPI } from '../../services/api';
import { Skeleton, SkeletonLine, SkeletonCircle } from '../../components/Skeleton';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import JourneyEndModal from '../../components/JourneyEndModal';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  fetchVehicles,
  selectDefaultVehicle,
  selectSelectedVehicle,
} from '../../store/slices/vehicleSlice';
import type { Vehicle } from '../../contexts/SettingsContext';

// const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string;
  rating?: number;
}

interface MapJourney {
  id: string;
  title: string;
  customTitle?: string | null;
  endLatitude?: number;
  endLongitude?: number;
  endAddress?: string;
  startTime?: string;
  vehicle?: string;
  photos?: { id: string; imageUrl: string }[];
}

export default function MapScreen(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const { mapType, vehicle: settingsVehicle } = useSettings();
  const dispatch = useAppDispatch();
  // VehiclePicker writes only to the Redux garage slice — not SettingsContext —
  // so the play-button must consult Redux first or it always falls back to "car".
  const garageSelectedVehicle = useAppSelector(selectSelectedVehicle);
  const garageDefaultVehicle = useAppSelector(selectDefaultVehicle);
  const activeGarageVehicle = garageSelectedVehicle ?? garageDefaultVehicle;
  const effectiveVehicleType: Vehicle = ((activeGarageVehicle?.type as Vehicle | undefined) ?? settingsVehicle) || 'car';
  const { isTracking, startJourney, currentLocation } = useJourney();
  const stats = useJourneyStats();
  const routePoints = useJourneyRoutePoints();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapJourneys, setMapJourneys] = useState<MapJourney[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<{ latitude: number; longitude: number; name?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; description: string; placeId: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [isStartBusy, setIsStartBusy] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Navigation / Follow Mode State
  const [isNavigationMode, setIsNavigationMode] = useState(true);
  const isManuallyPanningRef = useRef(false);
  const lastUserGestureAtRef = useRef(0);
  const lastCameraUpdateRef = useRef(0);

  useEffect(() => {
    if (isTracking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    pulseAnim.setValue(1);
    return undefined;
  }, [isTracking, pulseAnim]);

  // Auto-follow Logic for Main Map Tab
  useEffect(() => {
    if (!isTracking || !currentLocation || !isNavigationMode || isManuallyPanningRef.current) return;

    const now = Date.now();
    // Throttle camera updates to every 2 seconds to avoid excessive churn
    if (now - lastCameraUpdateRef.current < 2000) return;
    // Cooldown after user interaction (3 seconds)
    if (now - lastUserGestureAtRef.current < 3000) return;

    lastCameraUpdateRef.current = now;
    
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [currentLocation, isTracking, isNavigationMode]);

  const filterTypes = useMemo(() => [
    { key: 'gas', serverType: 'gas_station', label: t('map.filters.gas') },
    { key: 'lodging', serverType: 'lodging', label: t('map.filters.hotel') },
    { key: 'restaurant', serverType: 'restaurant', label: t('map.filters.restaurant') },
    { key: 'tourist_attraction', serverType: 'tourist_attraction', label: t('map.filters.attractions') },
    { key: 'shopping_mall', serverType: 'shopping_mall', label: t('map.filters.shopping') },
  ], [t]);

  const getMockPlaces = useCallback((filter?: string): Place[] => {
    if (!location) return [];
    const samples: Place[] = [
      {
        id: 'mock-gas-1',
        name: 'Shell Gas Station',
        latitude: location.coords.latitude + 0.01,
        longitude: location.coords.longitude + 0.01,
        type: 'gas',
        rating: 4.2,
      },
      {
        id: 'mock-food-1',
        name: "McDonald's",
        latitude: location.coords.latitude - 0.005,
        longitude: location.coords.longitude + 0.008,
        type: 'restaurant',
        rating: 4.0,
      },
      {
        id: 'mock-hotel-1',
        name: 'Holiday Inn',
        latitude: location.coords.latitude + 0.008,
        longitude: location.coords.longitude - 0.012,
        type: 'lodging',
        rating: 4.5,
      },
    ];

    if (filter) {
      const filtered = samples.filter(place => place.type === filter);
      if (filtered.length > 0) {
        return filtered;
      }
    }

    return samples;
  }, [location]);

  useEffect(() => {
    getCurrentLocation(false);
    fetchMapJourneys();
    // Hydrate the garage so the play button knows which vehicle to use.
    // Without this, the effective vehicle stays "car" until the user opens
    // new-journey or settings, which is the source of the "vehicle reverts"
    // complaint from formless rides.
    dispatch(fetchVehicles());
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dispatch]);

  const fetchMapJourneys = async () => {
    try {
      // Fetch completed journeys for the map history
      const response = await userAPI.getJourneyHistory({ status: 'COMPLETED', limit: 20 });
      if (response && response.journeys) {
        setMapJourneys(response.journeys);
      }
    } catch (error) {
      console.error('Failed to fetch map journeys:', error);
    }
  };

  const getCurrentLocation = async (promptIfMissing = true) => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' && promptIfMissing) {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }

      if (status !== 'granted') {
        setError(t('map.locationPermDenied'));
        // Set a default region if permission denied, so map still renders
        setInitialRegion({
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
        return;
      }

      // Try to get cached location first for speed
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        setLocation(lastKnown);
        const region = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setInitialRegion(region);
        if (promptIfMissing) animateToRegion(region);
      }

      // Then fetch fresh high-accuracy location
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      setLocation(currentLocation);
      const freshRegion = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      
      if (!lastKnown) {
         setInitialRegion(freshRegion);
      }
      
      // If user manually pressed the button (promptIfMissing=true), animate to fresh location
      if (promptIfMissing) {
        animateToRegion(freshRegion);
      }
    } catch (error: any) {
      console.error('Location error:', error);
      // Fallback region if location fails
       if (!initialRegion) {
        setInitialRegion({
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      }
    }
  };

  const fetchNearbyPlaces = useCallback(async (filterKey?: string) => {
    const targetLat = destination?.latitude ?? location?.coords.latitude;
    const targetLng = destination?.longitude ?? location?.coords.longitude;

    if (!targetLat || !targetLng) return;

    const activeFilter = filterKey ?? selectedFilter;
    try {
      setLoading(true);
      const serverType = filterTypes.find(f => f.key === activeFilter)?.serverType || 'point_of_interest';
      const response = await placesAPI.searchNearby({
        latitude: targetLat,
        longitude: targetLng,
        type: serverType,
        radius: 5000,
      });

      if (!response?.places || response.places.length === 0) {
        setPlaces(getMockPlaces(activeFilter ?? undefined));
        return;
      }

      const formattedPlaces = response.places
        .map((place: any) => {
          const latitudeCandidate =
            typeof place.latitude === 'number'
              ? place.latitude
              : typeof place?.location?.latitude === 'number'
                ? place.location.latitude
                : typeof place?.geometry?.location?.lat === 'number'
                  ? place.geometry.location.lat
                  : null;
          const longitudeCandidate =
            typeof place.longitude === 'number'
              ? place.longitude
              : typeof place?.location?.longitude === 'number'
                ? place.location.longitude
                : typeof place?.geometry?.location?.lng === 'number'
                  ? place.geometry.location.lng
                  : null;

          if (typeof latitudeCandidate !== 'number' || typeof longitudeCandidate !== 'number') {
            return null;
          }

          return {
            id: place.id || place.place_id || String(Math.random()),
            name: place.name || 'Unknown',
            latitude: latitudeCandidate,
            longitude: longitudeCandidate,
            type: activeFilter,
            rating: typeof place.rating === 'number' ? place.rating : undefined,
          } as Place;
        })
        .filter(Boolean) as Place[];

      setPlaces(formattedPlaces);
    } catch (error: any) {
      console.error('Places fetch error:', error);
      setPlaces(getMockPlaces(activeFilter ?? undefined));
    } finally {
      setLoading(false);
    }
  }, [location, destination, selectedFilter, filterTypes, getMockPlaces]);

  useEffect(() => {
    if ((location || destination) && isAuthenticated && selectedFilter) {
      fetchNearbyPlaces(selectedFilter);
    }
  }, [location, destination, selectedFilter, isAuthenticated, fetchNearbyPlaces]);



  const handleStartJourney = async () => {
    if (!isAuthenticated) {
      Alert.alert(t('map.authRequired'), t('map.loginToStart'));
      return;
    }
    if (isTracking) {
      setShowEndModal(true);
      return;
    }
    if (isStartBusy) return;
    setIsStartBusy(true);
    try {
      const success = await startJourney({
        // Leave title undefined so the backend default ("My Journey") only
        // appears when the user actually skips JourneyEndModal's name field.
        // If the user types a name later, customTitle becomes the source of truth.
        vehicle: effectiveVehicleType,
        vehicleId: activeGarageVehicle?.id,
        vehicleName: activeGarageVehicle
          ? `${activeGarageVehicle.name} (${activeGarageVehicle.make} ${activeGarageVehicle.model})`
          : undefined,
      });
      if (success) {
        router.push('/journey');
      } else {
        Alert.alert(t('alerts.error'), t('alerts.startJourneyError'));
      }
    } finally {
      setIsStartBusy(false);
    }
  };

  const handleStartJourneyToDestination = async () => {
    if (!isAuthenticated) {
      Alert.alert(t('map.authRequired'), t('map.loginToStart'));
      return;
    }
    if (isStartBusy) return;
    setIsStartBusy(true);
    try {
      const success = await startJourney({
        vehicle: effectiveVehicleType,
        vehicleId: activeGarageVehicle?.id,
        vehicleName: activeGarageVehicle
          ? `${activeGarageVehicle.name} (${activeGarageVehicle.make} ${activeGarageVehicle.model})`
          : undefined,
        endLocation: destination
          ? { latitude: destination.latitude, longitude: destination.longitude, address: destination.name || 'Destination' }
          : undefined,
      });
      if (success) {
        router.push('/journey');
      } else {
        Alert.alert(t('alerts.error'), t('alerts.startJourneyError'));
      }
    } finally {
      setIsStartBusy(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        Alert.alert(t('map.notFound'), t('map.destNotFound'));
      }
    } catch {
      Alert.alert(t('alerts.error'), t('map.searchError'));
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
      Alert.alert(t('alerts.error'), t('map.placeDetailsError'));
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{t('map.loginToView')}</Text>
        </View>
      </View>
    );
  }

  // Removed error check that blocks map rendering. We now fallback to default region.



  return (
    <View style={styles.container}>
      {/* Map */}
      {initialRegion ? (
        <MapView
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={styles.map}
          ref={mapRef as any}
          initialRegion={initialRegion}
          showsUserLocation={true}
          showsMyLocationButton={false}
          mapType={Platform.OS === 'ios' && mapType === 'terrain' ? 'standard' : mapType}
          onTouchStart={() => {
            isManuallyPanningRef.current = true;
            lastUserGestureAtRef.current = Date.now();
            setIsNavigationMode(false);
          }}
          onPanDrag={() => {
            lastUserGestureAtRef.current = Date.now();
          }}
          onRegionChangeComplete={(r, { isGesture }) => {
            if (isGesture) {
              isManuallyPanningRef.current = true;
              lastUserGestureAtRef.current = Date.now();
              setIsNavigationMode(false);
            }
          }}
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
              title={destination.name || t('map.destination')}
              pinColor="#F9A825"
            />
          )}
          
          {/* Active journey route breadcrumb */}
          {isTracking && routePoints.length > 1 && (
            <Polyline coordinates={routePoints} strokeWidth={4} strokeColor="#F9A825" />
          )}

          {/* Completed Journeys Cards */}
          {mapJourneys.map((journey) => {
            if (!journey.endLatitude || !journey.endLongitude) return null;
            
            // Check if we have photos to show a stack effect
            const hasPhotos = journey.photos && journey.photos.length > 0;
            const coverPhoto = hasPhotos ? journey.photos![0].imageUrl : null;

            return (
              <Marker
                key={journey.id}
                coordinate={{
                  latitude: journey.endLatitude,
                  longitude: journey.endLongitude,
                }}
                onPress={() => router.push({ pathname: '/journey-detail', params: { journeyId: journey.id } })}
                tracksViewChanges={false} // Optimization for static markers
              >
                 <View style={styles.cardMarkerContainer}>
                    {/* Stack effect layers if photos exist (simplified visual) */}
                    {hasPhotos && <View style={[styles.cardStackLayer, { transform: [{ rotate: '3deg' }] }]} />}
                    {hasPhotos && <View style={[styles.cardStackLayer, { transform: [{ rotate: '-3deg' }] }]} />}
                    
                    {/* Main Card */}
                    <View style={styles.cardMarker}>
                      {coverPhoto && (
                        <Image source={{ uri: coverPhoto }} style={styles.cardImage} contentFit="cover" transition={200} />
                      )}
                      <View style={styles.cardContent}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {journey.customTitle || journey.title || t('journey.defaultTitle')}
                        </Text>
                        {/* Use a TouchableOpacity here so the inner arrow has its own
                            hit target. The parent Marker.onPress still fires when the
                            user taps elsewhere on the card, but Android frequently
                            swallows taps on icons sitting flush against a marker edge
                            — explicit touchable + hitSlop fixes the "arrow not clickable"
                            complaint. */}
                        <TouchableOpacity
                          style={styles.cardFooter}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          activeOpacity={0.7}
                          onPress={() => router.push({ pathname: '/journey-detail', params: { journeyId: journey.id } })}
                        >
                           <Text style={styles.cardSubtitle}>{t('common.view')}</Text>
                           <Ionicons name="arrow-forward" size={12} color="#000" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    {/* Anchor Point */}
                    <View style={styles.cardAnchor} />
                 </View>
              </Marker>
            );
          })}

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
          placeholder={t('map.searchPlaceholder')}
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

      {/* Destination bottom sheet — shown when user has searched a location */}
      {destination && !isTracking && (
        <View style={[styles.destinationSheet, { bottom: insets.bottom + 100 }]}>
          <View style={styles.destinationInfo}>
            <MaterialIcons name="place" size={18} color="#F9A825" />
            <Text style={styles.destinationName} numberOfLines={1}>
              {destination.name || t('map.destination')}
            </Text>
            <TouchableOpacity onPress={() => { setDestination(null); setQuery(''); }}>
              <MaterialIcons name="close" size={18} color="#888" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.startJourneyDestBtn, isStartBusy && { opacity: 0.6 }]}
            onPress={handleStartJourneyToDestination}
            disabled={isStartBusy}
            activeOpacity={0.85}
          >
            {isStartBusy ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.startJourneyDestBtnText}>Start Journey</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Active journey mini-stats sheet on map tab */}
      {isTracking && (
        <View style={[styles.miniStatsSheet, { bottom: insets.bottom + 80 }]}>
          <View style={styles.miniStatsRow}>
            <View style={styles.miniStatItem}>
              <Text style={styles.miniStatValue}>{formatTime(Math.floor(stats?.totalTime || 0))}</Text>
              <Text style={styles.miniStatLabel}>{t('journey.time')}</Text>
            </View>
            <View style={styles.miniStatDivider} />
            <View style={styles.miniStatItem}>
              <Text style={styles.miniStatValue}>{stats?.currentSpeed?.toFixed(0) || '0'}</Text>
              <Text style={styles.miniStatLabel}>km/h</Text>
            </View>
            <View style={styles.miniStatDivider} />
            <View style={styles.miniStatItem}>
              <Text style={styles.miniStatValue}>{(stats?.totalDistance || 0).toFixed(2)}</Text>
              <Text style={styles.miniStatLabel}>km</Text>
            </View>
            <TouchableOpacity style={styles.expandBtn} onPress={() => router.push('/journey')}>
              <MaterialIcons name="open-in-full" size={18} color="#F9A825" />
            </TouchableOpacity>
          </View>
          {/* Red live indicator strip */}
          <View style={styles.liveStrip}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      )}

      {/* Floating Action Buttons */}
      <TouchableOpacity
        style={[styles.floatingButton, { bottom: insets.bottom + (isTracking ? 230 : 150) }]}
        onPress={handleStartJourney}
        activeOpacity={0.8}
        disabled={isStartBusy && !isTracking}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isTracking ? (
          <Animated.View style={[styles.stopButtonOuter, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.stopButtonInner}>
              <MaterialIcons name="stop" size={22} color="#fff" />
            </View>
          </Animated.View>
        ) : isStartBusy ? (
          <View style={[styles.floatingButtonImage, styles.loadingButton]}>
            <ActivityIndicator color="#000" size="small" />
          </View>
        ) : (
          <Image
            source={require('../../assets/images/2025-09-26/NydH8KLPYS.png')}
            style={styles.floatingButtonImage}
            contentFit="contain"
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.floatingButton, { bottom: insets.bottom + (isTracking ? 165 : 85) }]}
        onPress={() => getCurrentLocation(true)}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Image
          source={require('../../assets/images/2025-09-26/4BNFvkcOE2.png')}
          style={styles.floatingButtonImage}
          contentFit="contain"
        />
      </TouchableOpacity>

      {/* Recenter Button (Main Map) */}
      {!isNavigationMode && isTracking && (
        <TouchableOpacity
          onPress={() => {
            isManuallyPanningRef.current = false;
            lastUserGestureAtRef.current = 0;
            setIsNavigationMode(true);
            if (mapRef.current && currentLocation) {
               mapRef.current.animateToRegion({
                 latitude: currentLocation.latitude,
                 longitude: currentLocation.longitude,
                 latitudeDelta: 0.01,
                 longitudeDelta: 0.01,
               }, 1000);
            }
            lastCameraUpdateRef.current = Date.now();
          }}
          style={[styles.recenterButton, { bottom: insets.bottom + 295 }]}
          activeOpacity={0.85}
        >
          <MaterialIcons name="navigation" size={20} color="#F9A825" />
          <Text style={styles.recenterText}>{t('journey.recenter') || 'Recenter'}</Text>
        </TouchableOpacity>
      )}

      <JourneyEndModal
        visible={showEndModal}
        onDone={() => setShowEndModal(false)}
      />

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
    zIndex: 30,
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
    elevation: 12,
    overflow: "hidden",
    zIndex: 40,
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
    zIndex: 20,
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
    zIndex: 50,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  floatingButtonImage: {
    width: 50,
    height: 50,
  },
  loadingButton: {
    borderRadius: 25,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonOuter: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  stopButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationSheet: {
    position: 'absolute',
    left: 15,
    right: 15,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    zIndex: 50,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    gap: 10,
  },
  destinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  destinationName: {
    flex: 1,
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  startJourneyDestBtn: {
    backgroundColor: '#BEFFA7',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startJourneyDestBtnText: {
    fontFamily: 'Space Grotesk',
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  miniStatsSheet: {
    position: 'absolute',
    left: 15,
    right: 80,
    backgroundColor: '#fff',
    borderRadius: 16,
    zIndex: 50,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  miniStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  miniStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  miniStatValue: {
    fontFamily: 'Poppins',
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  miniStatLabel: {
    fontFamily: 'Space Grotesk',
    fontSize: 9,
    color: '#888',
  },
  miniStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#eee',
  },
  expandBtn: {
    padding: 6,
  },
  liveStrip: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    fontFamily: 'Space Grotesk',
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1.5,
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
  cardMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140, // Fixed width for consistency
  },
  cardStackLayer: {
    position: 'absolute',
    width: 130,
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  cardMarker: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardImage: {
    width: '100%',
    height: 60,
    backgroundColor: '#F5F5F5',
  },
  cardContent: {
    padding: 8,
  },
  cardTitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardSubtitle: {
    fontFamily: 'Space Grotesk',
    fontSize: 10,
    color: '#000000',
    fontWeight: '500',
  },
  cardAnchor: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 0,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF', // Matches card background
    marginTop: -1, // Overlap slightly
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  recenterButton: {
    position: 'absolute',
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 100,
  },
  recenterText: {
    fontFamily: 'Space Grotesk',
    fontSize: 14,
    fontWeight: '700',
    color: '#F9A825',
    marginLeft: 8,
  },
});

