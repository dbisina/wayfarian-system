import React, { useCallback } from 'react';
import { BackHandler, StatusBar, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import OnboardingPage from '../../components/dw/OnboardingPage';

export default function OnboardingScreen2() {
  const { completeOnboarding, hasCompletedOnboarding, isAuthenticated } = useAuth();
  const { t } = useTranslation();

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

  if (hasCompletedOnboarding || isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" />
      </View>
    );
  }

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/login');
  };

  return (
    <OnboardingPage
      image={require('../../assets/images/2025-09-26/1ofOx9yGqJ.jpg')}
      index={2}
      total={3}
      title={t('onboarding.step2.title')}
      body={t('onboarding.step2.description')}
      onNext={() => router.push('/step3')}
      onSkip={handleSkip}
    />
  );
}
