import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

export default function OnboardingScreen1() {
  const handleNext = () => {
    router.push('/(onboarding)/step2');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Wayfarian</Text>
      <Text style={styles.subtitle}>
        Track your journeys, connect with fellow travelers, and discover new adventures.
      </Text>
      
      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 24,
  },
  nextButton: {
    backgroundColor: '#F9A825',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
