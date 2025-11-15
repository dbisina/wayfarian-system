import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground
  source={require('../assets/images/2025-09-26/1ofOx9yGqJ.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.8)']}
          style={styles.overlay}
        >
          {/* Header */}
          <View style={styles.header}>
            <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <TouchableOpacity style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Main Content */}
          <View style={styles.content}>
            <Text style={styles.mainTitle}>The adventure begins.</Text>
            <Text style={styles.subtitle}>
              Your Traveler&apos;s Digital Diary. every ride, every memory, forever stored..
            </Text>
          </View>

          {/* Feature Cards */}
          <View style={styles.featuresContainer}>
            <View style={styles.featureCard}>
              <View style={styles.iconContainer}>
                <View style={styles.iconBackground}>
                  <View style={styles.locationIcon} />
                </View>
              </View>
              <Text style={styles.featureText}>START YOUR STORY</Text>
            </View>

            <View style={styles.featureCard}>
              <Text style={styles.featureText}>TRAVEL THE WORLD</Text>
              <View style={styles.iconContainer}>
                <View style={styles.iconBackground}>
                  <View style={styles.locationIcon} />
                </View>
              </View>
            </View>
          </View>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            {/* Progress Indicators */}
            <View style={styles.progressContainer}>
              <View style={styles.progressActive} />
              <View style={styles.progressInactive} />
            </View>

            {/* Next Button */}
            <TouchableOpacity style={styles.nextButton}>
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
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
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 27,
    marginBottom: 58,
  },
  logo: {
    height: 30,
    width: 120,
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 5,
    width: 40,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 10,
    color: '#FFFFFF',
    lineHeight: 15,
    textAlign: 'center',
  },
  content: {
    marginBottom: 120,
  },
  mainTitle: {
    fontFamily: 'Poppins',
    fontSize: 46,
    fontWeight: '500',
    color: '#FFFFBF',
    lineHeight: 69,
    marginBottom: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 6, height: 10 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontFamily: 'Poppins',
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    lineHeight: 27,
    marginTop: 0,
  },
  featuresContainer: {
    marginBottom: 80,
  },
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 25,
    position: 'relative',
  },
  iconContainer: {
    position: 'absolute',
  },
  iconBackground: {
    backgroundColor: '#F9A825',
    borderRadius: 15,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationIcon: {
    width: 27,
    height: 27,
    backgroundColor: '#FFFFFF',
    borderRadius: 13.5,
  },
  featureText: {
    fontFamily: 'Poppins',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 25,
  },
  progressContainer: {
    flexDirection: 'row',
    marginBottom: 19,
    gap: 2,
  },
  progressActive: {
    width: 20,
    height: 3,
    backgroundColor: '#F9A825',
    borderRadius: 3,
  },
  progressInactive: {
    width: 9,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
  },
  nextButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 40,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 361,
    height: 39,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextText: {
    fontFamily: 'Poppins',
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 23,
  },
});
