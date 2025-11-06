import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import LocationPicker from '../components/LocationPicker';
import { useJourney } from '../contexts/JourneyContext';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string;
}

export default function NewJourneyScreen() {
  const { startJourney } = useJourney();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const [journeyName, setJourneyName] = useState('');
  const [startLocation, setStartLocation] = useState<LocationData | null>(null);
  const [endLocation, setEndLocation] = useState<LocationData | null>(null);
  const [startDateTime, setStartDateTime] = useState('');
  const [notes, setNotes] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Get current location for better autocomplete results
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission not granted');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const handleSaveAndStart = async () => {
    if (!journeyName.trim() || !startLocation || !endLocation) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }
    
    try {
      const success = await startJourney({
        title: journeyName,
        startLocation: {
          latitude: startLocation.latitude,
          longitude: startLocation.longitude,
          address: startLocation.address,
        },
        endLocation: {
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
          address: endLocation.address,
        },
        vehicle: 'car', // You could add a vehicle selector
        ...(groupId ? { groupId: String(groupId) } : {}),
      });

      if (success) {
        // Navigate to journey screen to start tracking
        router.push('/journey');
      } else {
        Alert.alert('Error', 'Failed to start journey. Please try again.');
      }
    } catch (error) {
      console.error('Error starting journey:', error);
      Alert.alert('Error', 'Failed to start journey. Please try again.');
    }
  };

  const handleSaveForLater = () => {
    if (!journeyName.trim()) {
      Alert.alert('Missing Information', 'Please enter a journey name to save.');
      return;
    }
    
    // Here you would typically save the journey data for later
    console.log('Saving journey for later:', {
      journeyName,
      startLocation: startLocation ? {
        address: startLocation.address,
        coordinates: {
          latitude: startLocation.latitude,
          longitude: startLocation.longitude,
        },
      } : null,
      endLocation: endLocation ? {
        address: endLocation.address,
        coordinates: {
          latitude: endLocation.latitude,
          longitude: endLocation.longitude,
        },
      } : null,
      startDateTime,
      notes,
    });
    
    Alert.alert('Journey Saved', 'Your journey has been saved for later.', [
      {text: 'OK', onPress: () => router.back()}
    ]);
  };

  const openDateTimePicker = () => {
    // This would typically open a date/time picker
    // For now, we'll just set a placeholder
    const now = new Date();
    const formatted = now.toLocaleString();
    setStartDateTime(formatted);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Journey</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0} style={{ flex: 1 }}>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Journey Name */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Journey Name"
            value={journeyName}
            onChangeText={setJourneyName}
            placeholderTextColor="#999999"
          />
        </View>

        {/* Start Location */}
        <View style={styles.locationSection}>
          <LocationPicker
            placeholder="Start Location"
            value={startLocation?.address || ''}
            onLocationSelect={setStartLocation}
            currentLocation={currentLocation || undefined}
          />
          {startLocation && (
            <View style={styles.locationConfirmed}>
              <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.locationConfirmedText}>Location confirmed</Text>
            </View>
          )}
        </View>

        {/* End Location */}
        <View style={styles.locationSection}>
          <LocationPicker
            placeholder="End Location"
            value={endLocation?.address || ''}
            onLocationSelect={setEndLocation}
            currentLocation={currentLocation || undefined}
          />
          {endLocation && (
            <View style={styles.locationConfirmed}>
              <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.locationConfirmedText}>Location confirmed</Text>
            </View>
          )}
        </View>

        {/* Start Date & Time */}
        <TouchableOpacity 
          style={styles.inputContainer} 
          onPress={openDateTimePicker}
        >
          <View style={styles.dateTimeContainer}>
            <TextInput
              style={[styles.input, styles.dateTimeInput]}
              placeholder="Start Date & Time"
              value={startDateTime}
              editable={false}
              placeholderTextColor="#999999"
            />
            <MaterialIcons name="event" size={24} color="#999999" style={styles.calendarIcon} />
          </View>
        </TouchableOpacity>

        {/* Notes/Description */}
        <View style={styles.notesContainer}>
          <TextInput
            style={styles.notesInput}
            placeholder="Add notes, waypoints, or journey details..."
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            placeholderTextColor="#999999"
          />
        </View>
  </ScrollView>
  </KeyboardAvoidingView>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={handleSaveAndStart}
        >
          <Text style={styles.primaryButtonText}>Save & Start Tracking</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton} 
          onPress={handleSaveForLater}
        >
          <Text style={styles.secondaryButtonText}>Save for Later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8E8E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#E8E8E8',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  dateTimeContainer: {
    position: 'relative',
  },
  dateTimeInput: {
    paddingRight: 50,
  },
  calendarIcon: {
    position: 'absolute',
    right: 15,
    top: 18,
  },
  notesContainer: {
    marginBottom: 20,
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins',
    height: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 15,
  },
  primaryButton: {
    backgroundColor: '#F4E04D',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  locationSection: {
    marginBottom: 20,
  },
  locationConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  locationConfirmedText: {
    fontSize: 12,
    color: '#4CAF50',
    fontFamily: 'Poppins',
    marginLeft: 4,
    fontWeight: '500',
  },
});
