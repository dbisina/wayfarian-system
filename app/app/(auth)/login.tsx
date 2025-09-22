import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

export default function LoginScreen() {
  const handleSignIn = () => {
    // In a real app, you would authenticate the user here
    router.replace('/(onboarding)');
  };

  const handleSignUp = () => {
    router.push('/(auth)/register');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Wayfarian</Text>
      <Text style={styles.subtitle}>Your journey tracking companion</Text>
      
      <TouchableOpacity style={styles.signInButton} onPress={handleSignIn}>
        <Text style={styles.signInButtonText}>Sign In</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.signUpButton} onPress={handleSignUp}>
        <Text style={styles.signUpButtonText}>Sign Up</Text>
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
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 40,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#F9A825',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  signUpButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#F9A825',
    width: '100%',
    alignItems: 'center',
  },
  signUpButtonText: {
    color: '#F9A825',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
