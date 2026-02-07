import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import AnimatedLogoButton from '../../components/AnimatedLogoButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export default function OnboardingScreen2() {
  const { completeOnboarding, hasCompletedOnboarding, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.back();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [])
  );

  // Don't render onboarding content if user already completed it or is authenticated
  if (hasCompletedOnboarding || isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" />
      </View>
    );
  }

  const handleNext = () => {
    router.push('/step3');
  };

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ImageBackground
        source={{
          uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-16/gfiRO6qmSE.png'
        }}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.8)']}
          style={[styles.overlay, { paddingBottom: insets.bottom }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <AnimatedLogoButton containerStyle={styles.logoButton} size={40} />
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </TouchableOpacity>
          </View>

          {/* Main Content */}
          <View style={styles.content}>
            <Text style={styles.mainTitle}>{t('onboarding.step2.title')}</Text>
            <Text style={styles.description}>
              {t('onboarding.step2.description')}
            </Text>
          </View>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            {/* Progress Indicators */}
            <View style={styles.progressContainer}>
              <View style={styles.progressInactive} />
              <View style={styles.progressActive} />
            </View>

            {/* Next Button */}
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextText}>{t('onboarding.next')}</Text>
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
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 27,
    marginBottom: 58,
  },
  logoButton: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 5,
    width: 40,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
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
  description: {
    fontFamily: 'Poppins',
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    lineHeight: 27,
    marginTop: 0,
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