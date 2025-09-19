import React, {useState} from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
} from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import RideLogScreen from './src/screens/RideLogScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import GroupsScreen from './src/screens/GroupsScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import NewGroupScreen from './src/screens/NewGroupScreen';
import NewJourneyScreen from './src/screens/NewJourneyScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import OnboardingScreen2 from './src/screens/OnboardingScreen2';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

const App = (): React.ReactElement => {
  const [activeScreen, setActiveScreen] = useState('login');
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);

  const handleCreateGroup = () => {
    setActiveScreen('newGroup');
  };

  const handleBackToGroups = () => {
    setActiveScreen('people');
  };

  const handleGroupDetail = () => {
    setActiveScreen('groupDetail');
  };

  const handleBackToGroupDetail = () => {
    setActiveScreen('groupDetail');
  };

  const handleStartJourney = () => {
    setActiveScreen('newJourney');
  };

  const handleBackToMap = () => {
    setActiveScreen('map');
  };

  const handleStartTracking = () => {
    // This would typically start the actual journey tracking
    // For now, we'll just go back to the map
    setActiveScreen('map');
  };

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
    setActiveScreen('home');
  };

  const handleOnboardingNext = () => {
    if (onboardingStep === 1) {
      setOnboardingStep(2);
    } else {
      handleOnboardingComplete();
    }
  };

  const handleOnboardingSkip = () => {
    handleOnboardingComplete();
  };

  const handleSignIn = () => {
    setIsAuthenticated(true);
    setActiveScreen('onboarding');
  };

  const handleSignUp = () => {
    setActiveScreen('register');
  };

  const handleBackToLogin = () => {
    setActiveScreen('login');
  };

  const renderScreen = () => {
    if (!isAuthenticated) {
      switch (activeScreen) {
        case 'register':
          return <RegisterScreen onSignIn={handleBackToLogin} onSignUp={handleSignIn} />;
        case 'login':
        default:
          return <LoginScreen onSignIn={handleSignIn} onSignUp={handleSignUp} />;
      }
    }

    if (!hasCompletedOnboarding) {
      if (onboardingStep === 1) {
        return <OnboardingScreen onComplete={handleOnboardingNext} />;
      } else {
        return <OnboardingScreen2 onNext={handleOnboardingNext} onSkip={handleOnboardingSkip} />;
      }
    }
    
    switch (activeScreen) {
      case 'map':
        return <MapScreen onStartJourney={handleStartJourney} />;
      case 'log':
        return <RideLogScreen onTabPress={setActiveScreen} />;
      case 'trophy':
        return <LeaderboardScreen onTabPress={setActiveScreen} />;
      case 'people':
        return <GroupsScreen onTabPress={setActiveScreen} onCreateGroup={handleCreateGroup} onGroupDetail={handleGroupDetail} />;
      case 'groupDetail':
        return <GroupDetailScreen onBack={handleBackToGroups} />;
      case 'settings':
        return <SettingsScreen onTabPress={setActiveScreen} />;
      case 'newGroup':
        return <NewGroupScreen onBack={handleBackToGroups} />;
      case 'newJourney':
        return <NewJourneyScreen onBack={handleBackToMap} onStartTracking={handleStartTracking} />;
      case 'home':
      default:
        return <HomeScreen onTabPress={setActiveScreen} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle={!isAuthenticated || !hasCompletedOnboarding ? "light-content" : "dark-content"} 
        backgroundColor={!isAuthenticated || !hasCompletedOnboarding ? "transparent" : "#F6F6F6"} 
        translucent={!isAuthenticated || !hasCompletedOnboarding}
      />
      {renderScreen()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

export default App;
