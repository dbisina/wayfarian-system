import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

export default function OnboardingScreen3() {
  const handleGetStarted = () => {
    router.replace('/(auth)');
  };

  const handleSkip = () => {
    router.replace('/(auth)');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ImageBackground
        source={{
          uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-16/Y8uOfUFSkG.png'
        }}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>LOGO</Text>
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Main Content */}
          <View style={styles.content}>
            <Text style={styles.mainTitle}>The Challenge Awaits.</Text>
            <Text style={styles.description}>
              Solo rides. Group rides. Extra challenges. Earn rewards as you travel.
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {/* Progress Indicator */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={styles.progressFill} />
              </View>
            </View>

            {/* Get Started Button */}
            <TouchableOpacity style={styles.getStartedButton} onPress={handleGetStarted}>
              <Text style={styles.getStartedButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 27,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 23,
    marginBottom: 52,
  },
  logo: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 22,
    color: '#FFFFFF',
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    width: 40,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontFamily: 'Poppins',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 75,
  },
  mainTitle: {
    fontFamily: 'Poppins',
    fontSize: 40,
    fontWeight: '500',
    lineHeight: 60,
    color: '#FFFFBF',
    marginBottom: 95,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: {width: 6, height: 10},
    textShadowRadius: 4,
  },
  description: {
    fontFamily: 'Poppins',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 30,
    color: '#FFFFFF',
    maxWidth: 311,
  },
  footer: {
    alignItems: 'center',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    width: 30,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    width: 30,
    height: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  getStartedButton: {
    backgroundColor: '#FF6B35',
    width: 348,
    height: 39,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  getStartedButtonText: {
    fontFamily: 'Poppins',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    color: '#FFFFFF',
  },
});
