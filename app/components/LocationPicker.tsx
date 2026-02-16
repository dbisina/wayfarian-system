import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Skeleton } from './Skeleton';
import { placesAPI } from '../services/api';
import { useTranslation } from 'react-i18next';

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
  currentLocation?: { latitude: number; longitude: number };
  style?: any;
}

export default function LocationPicker({
  placeholder,
  value = '',
  onLocationSelect,
  currentLocation,
  style,
}: LocationPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAutocomplete = useCallback(async (text: string) => {
    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const params: any = { input: text };
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
      
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [currentLocation]);

  const handleTextChange = (text: string) => {
    setQuery(text);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(!!currentLocation);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchAutocomplete(text.trim());
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: LocationSuggestion) => {
    try {
      setLoading(true);
      setQuery(suggestion.description);
      setSuggestions([]);
      setShowSuggestions(false);
      Keyboard.dismiss();

      // Get place details to get coordinates
      const details = await placesAPI.placeDetails(suggestion.placeId);
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
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            value={query}
            onChangeText={handleTextChange}
            onSubmitEditing={handleSubmit}
            onFocus={() => setShowSuggestions(!!currentLocation)}
            placeholderTextColor="#999999"
            returnKeyType="search"
          />
          
          {loading && (
            <Skeleton width={16} height={16} borderRadius={8} style={styles.loadingIndicator} />
          )}
          
          {query.length > 0 && !loading && (
            <TouchableOpacity onPress={clearInput} style={styles.clearButton}>
              <MaterialIcons name="clear" size={20} color="#999999" />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity onPress={handleSubmit} style={styles.searchButton}>
            <MaterialIcons name="search" size={20} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>

      {showSuggestions && (suggestions.length > 0 || !!currentLocation) && (
        <View style={styles.suggestionsContainer}>
          {currentLocation && (
            <TouchableOpacity
              style={[styles.suggestionItem, styles.currentLocationItem]}
              onPress={handleUseCurrentLocation}
            >
              <MaterialIcons name="my-location" size={16} color="#007AFF" style={styles.suggestionIcon} />
              <Text numberOfLines={1} style={[styles.suggestionText, styles.currentLocationText]}>
                {t('common.useCurrentLocation')}
              </Text>
            </TouchableOpacity>
          )}
          {suggestions.slice(0, 5).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.suggestionItem}
              onPress={() => handleSelectSuggestion(item)}
            >
              <MaterialIcons name="location-on" size={16} color="#999999" style={styles.suggestionIcon} />
              <Text numberOfLines={2} style={styles.suggestionText}>
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
  container: {
    position: 'relative',
    zIndex: 10000,
  },
  inputContainer: {
    marginBottom: 0,
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
    bottom: 60,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 10001,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  suggestionIcon: {
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#333333',
    fontFamily: 'Poppins',
    lineHeight: 20,
  },
  currentLocationItem: {
    backgroundColor: '#F5FAFF',
  },
  currentLocationText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});