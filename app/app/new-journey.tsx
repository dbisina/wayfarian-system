import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function NewJourneyScreen() {
  const [journeyName, setJourneyName] = useState('');
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [notes, setNotes] = useState('');

  const handleSaveAndStart = () => {
    if (!journeyName.trim() || !startLocation.trim() || !endLocation.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }
    
    // Here you would typically save the journey data
    console.log('Starting journey:', {
      journeyName,
      startLocation,
      endLocation,
      startDateTime,
      notes,
    });
    
    // Navigate to journey screen to start tracking
    router.push('/journey');
  };

  const handleSaveForLater = () => {
    if (!journeyName.trim()) {
      Alert.alert('Missing Information', 'Please enter a journey name to save.');
      return;
    }
    
    // Here you would typically save the journey data for later
    console.log('Saving journey for later:', {
      journeyName,
      startLocation,
      endLocation,
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Start Location"
            value={startLocation}
            onChangeText={setStartLocation}
            placeholderTextColor="#999999"
          />
        </View>

        {/* End Location */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="End Location"
            value={endLocation}
            onChangeText={setEndLocation}
            placeholderTextColor="#999999"
          />
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
});
