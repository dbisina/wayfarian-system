import React, { useCallback } from 'react';
import { BackHandler, StatusBar, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import OnboardingPage from '../../components/dw/OnboardingPage';

export default function OnboardingScreen3() {
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

  const completeAndContinue = async () => {
    await completeOnboarding();
    router.replace('/(auth)/register');
  };

  return (
    <OnboardingPage
      image={require('../../assets/images/2025-09-26/road-6221011_1920.jpg')}
      index={3}
      total={3}
      title={t('onboarding.step3.title')}
      body={t('onboarding.step3.description')}
      onNext={() => void completeAndContinue()}
      onSkip={() => void completeAndContinue()}
    />
  );
}
