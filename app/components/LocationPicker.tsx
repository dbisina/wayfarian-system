import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Keyboard, LayoutAnimation, Platform, UIManager, ActivityIndicator } from 'react-native';
import TextInput from './dw/DWTextInput';
import { MaterialIcons } from '@expo/vector-icons';
import { Skeleton } from './Skeleton';
import { newSearchSession, placesAPI } from '../services/api';
import { useTranslation } from 'react-i18next';
import { AMBER, F, useDW } from '../constants/design';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

const DEBOUNCE_MS = 300; // searches once the rider pauses, not on every keystroke
const MIN_CHARS = 3; // shorter queries match too much to be worth a lookup
const smooth = () => LayoutAnimation.configureNext(LayoutAnimation.create(140, 'easeInEaseOut', 'opacity'));

interface LocationSuggestion {
  id: string;
  description: string;
  placeId: string;
}

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string;
}

interface LocationPickerProps {
  placeholder: string;
  value?: string;
  onLocationSelect: (location: LocationData) => void;
  onLocationClear?: () => void;
  currentLocation?: { latitude: number; longitude: number };
  style?: any;
  suggestionsPosition?: 'bottom' | 'top';
  /** Small caption above the input (design: From / To). */
  label?: string;
  /** Amber outline on the field. */
  active?: boolean;
  /** Leading marker rendered before the field (dot or diamond). */
  marker?: React.ReactNode;
}

export default function LocationPicker({
  placeholder,
  value = '',
  onLocationSelect,
  onLocationClear,
  currentLocation,
  style,
  suggestionsPosition = 'bottom',
  label,
  active,
  marker,
}: LocationPickerProps) {
  const { t } = useTranslation();
  const d = useDW();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest search may update the list, so a slow earlier answer can never overwrite it.
  const latestSearch = useRef(0);
  // Answers already fetched, so typing back over a query shows its results instantly.
  const cache = useRef(new Map<string, LocationSuggestion[]>());
  // One search session (keystrokes through to the picked place) is billed as one.
  const session = useRef(newSearchSession());

  // Sync internal query state with value prop
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const fetchAutocomplete = useCallback(async (text: string) => {
    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const key = text.toLowerCase();
    const hit = cache.current.get(key);
    if (hit) {
      latestSearch.current++;
      setSearching(false);
      smooth();
      setSuggestions(hit);
      setShowSuggestions(hit.length > 0);
      return;
    }

    const id = ++latestSearch.current;
    setSearching(true);
    try {
      const params: any = { input: text, sessionToken: session.current };
      if (currentLocation) {
        params.latitude = currentLocation.latitude;
        params.longitude = currentLocation.longitude;
        params.radius = 20000; // 20km radius
      }
      
      const response = await placesAPI.autocomplete(params);
      const items = (response?.predictions || []).map((p: any) => ({
        id: p.placeId,
        placeId: p.placeId,
        description: p.description,
      }));
      
      if (cache.current.size > 60) cache.current.clear();
      cache.current.set(key, items);
      if (id !== latestSearch.current) return; // a newer search is already running
      smooth();
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
    } catch (error) {
      if (id !== latestSearch.current) return;
      console.error('Autocomplete error:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      if (id === latestSearch.current) setSearching(false);
    }
  }, [currentLocation]);

  const handleTextChange = (text: string) => {
    setQuery(text);

    if (value && text !== value) {
      onLocationClear?.();
    }
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!text.trim()) {
      latestSearch.current++;
      setSearching(false);
      setSuggestions([]);
      setShowSuggestions(!!currentLocation);
      return;
    }

    // Open the list straight away (with a searching row) instead of popping in after the network
    // answer; results from the previous letters stay visible until the new ones arrive.
    setShowSuggestions(true);
    if (text.trim().length < MIN_CHARS) {
      latestSearch.current++;
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchAutocomplete(text.trim());
    }, DEBOUNCE_MS);
  };

  const handleSelectSuggestion = async (suggestion: LocationSuggestion) => {
    try {
      setLoading(true);
      setQuery(suggestion.description);
      setSuggestions([]);
      setShowSuggestions(false);
      Keyboard.dismiss();

      // Get place details to get coordinates. This closes the search session.
      const token = session.current;
      session.current = newSearchSession();
      const details = await placesAPI.placeDetails(suggestion.placeId, token);
      const lat = details?.place?.location?.latitude;
      const lng = details?.place?.location?.longitude;
      const address = details?.place?.address || suggestion.description;

      if (typeof lat === 'number' && typeof lng === 'number') {
        onLocationSelect({
          latitude: lat,
          longitude: lng,
          address,
          placeId: suggestion.placeId,
        });
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      // Fallback: try geocoding the description
      try {
        const geocodeResult = await placesAPI.geocode(suggestion.description);
        const lat = geocodeResult?.result?.location?.latitude;
        const lng = geocodeResult?.result?.location?.longitude;
        const address = geocodeResult?.result?.formattedAddress || suggestion.description;

        if (typeof lat === 'number' && typeof lng === 'number') {
          onLocationSelect({
            latitude: lat,
            longitude: lng,
            address,
          });
        }
      } catch (geocodeError) {
        console.error('Geocode fallback failed:', geocodeError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      setSuggestions([]);
      setShowSuggestions(false);
      Keyboard.dismiss();

      const result = await placesAPI.geocode(query.trim());
      const lat = result?.result?.location?.latitude;
      const lng = result?.result?.location?.longitude;
      const address = result?.result?.formattedAddress || query.trim();

      if (typeof lat === 'number' && typeof lng === 'number') {
        onLocationSelect({
          latitude: lat,
          longitude: lng,
          address,
        });
      }
    } catch (error) {
      console.error('Geocode error:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearInput = () => {
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(!!currentLocation);
    onLocationClear?.();
  };

  const handleUseCurrentLocation = () => {
    if (!currentLocation) return;
    const address = t('common.currentLocation');
    setQuery(address);
    setSuggestions([]);
    setShowSuggestions(false);
    Keyboard.dismiss();
    onLocationSelect({
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      address,
    });
  };

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.inputWrapper, styles.dwWrapper, { backgroundColor: d.surface2 }, active && { borderColor: AMBER, borderWidth: 2 }]}>
        {marker}
        <View style={{ flex: 1 }}>
        {label ? <Text style={[styles.dwLabel, { color: d.ink2 }]}>{label}</Text> : null}
        <TextInput
          style={[styles.input, styles.dwInput, { color: d.ink }]}
          placeholder={placeholder}
          value={query}
          onChangeText={handleTextChange}
          onSubmitEditing={handleSubmit}
          onFocus={() => setShowSuggestions(!!currentLocation)}
          placeholderTextColor={d.ink2}
          returnKeyType="search"
        />
        </View>
        
        {loading && (
          <Skeleton width={16} height={16} borderRadius={8} style={styles.loadingIndicator} />
        )}
        
        {query.length > 0 && !loading && (
          <TouchableOpacity onPress={clearInput} style={styles.clearButton}>
            <MaterialIcons name="clear" size={20} color={d.ink2} />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity onPress={handleSubmit} style={styles.searchButton}>
          <MaterialIcons name="search" size={20} color={d.ink} />
        </TouchableOpacity>
      </View>

      {showSuggestions && (suggestions.length > 0 || searching || !!currentLocation) && (
        <View 
          style={[
            styles.suggestionsContainer,
            { backgroundColor: d.surface },
            suggestionsPosition === 'top' 
              ? { bottom: '100%', marginBottom: 8, shadowOffset: { width: 0, height: -4 } }
              // In the normal flow (not floating) so it can never be clipped by the sheet or sit
              // outside the area that receives taps.
              : { position: 'relative', left: undefined, right: undefined, top: undefined, marginTop: 8, shadowOffset: { width: 0, height: 4 } }
          ]}
        >
          {currentLocation && (
            <TouchableOpacity
              style={[
                styles.suggestionItem, 
                styles.currentLocationItem,
                suggestions.length === 0 && { borderBottomWidth: 0 }
              ]}
              onPress={handleUseCurrentLocation}
            >
              <View style={styles.suggestionIconContainer}>
                <MaterialIcons name="my-location" size={20} color="#007AFF" />
              </View>
              <Text numberOfLines={1} style={[styles.suggestionText, styles.currentLocationText]}>
                {t('common.useCurrentLocation')}
              </Text>
            </TouchableOpacity>
          )}
          {searching && suggestions.length === 0 && (
            <View style={[styles.suggestionItem, { borderBottomWidth: 0 }]}>
              <ActivityIndicator size="small" color={AMBER} />
              <Text style={[styles.suggestionText, { color: d.ink2 }]}>Searching…</Text>
            </View>
          )}
          {suggestions.slice(0, 5).map((item, index, filteredSuggestions) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.suggestionItem,
                index === filteredSuggestions.length - 1 && { borderBottomWidth: 0 }
              ]}
              onPress={() => handleSelectSuggestion(item)}
            >
              <View style={[styles.suggestionIconContainer, { backgroundColor: d.surface2 }]}>
                <MaterialIcons name="location-on" size={20} color={d.ink2} />
              </View>
              <Text numberOfLines={2} style={[styles.suggestionText, { color: d.ink }]}>
                {item.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dwWrapper: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 0, height: 52, gap: 14, shadowOpacity: 0, elevation: 0 },
  dwLabel: { fontFamily: F.bold, fontSize: 11 },
  dwInput: { fontFamily: F.bold, fontSize: 15, padding: 0 },
  container: {
    position: 'relative',
    zIndex: 10000,
  },
  inputWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
  },
  loadingIndicator: {
    marginRight: 8,
  },
  clearButton: {
    marginRight: 8,
    padding: 4,
  },
  searchButton: {
    padding: 4,
  },
  suggestionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: 280,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10001,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
    fontFamily: F.semi,
    lineHeight: 20,
    fontWeight: '500',
  },
  currentLocationItem: {
    backgroundColor: '#FFFFFF',
  },
  currentLocationText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
