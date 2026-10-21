import React from 'react';
import { View, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import OnboardingPage from '../../components/dw/OnboardingPage';

export default function OnboardingScreen() {
  const { completeOnboarding, hasCompletedOnboarding, isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/register');
  };

  // Avoid a flash of onboarding when the auth layout is about to redirect.
  if (hasCompletedOnboarding || isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" />
      </View>
    );
  }

  return (
    <OnboardingPage
      image={require('../../assets/images/2025-09-26/1ofOx9yGqJ.jpg')}
      index={1}
      total={3}
      title={t('onboarding.step1.title', 'The adventure begins.')}
      body={t('onboarding.step1.description', "Your rider's diary. Every ride, every stop, every photo, kept.")}
      onNext={() => router.push('/step2')}
      onSkip={handleSkip}
    />
  );
}
