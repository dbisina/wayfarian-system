import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
} from 'react-native';
import Svg, {Path, Circle, Rect} from 'react-native-svg';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

interface OnboardingScreenProps {
  onComplete: () => void;
}

const OnboardingScreen = ({onComplete}: OnboardingScreenProps): JSX.Element => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const slides = [
    {
      id: 1,
      title: 'Start Your',
      subtitle: 'Journey',
      description: 'Your travel story for saving memories, achievements and relating every mile.',
      buttonText: 'Get Started',
      secondaryButtonText: 'Skip',
      backgroundColor: '#1A1A1A',
      accentColor: '#FF6B35',
      icon: 'location',
      gradient: ['#1A1A1A', '#2D2D2D'],
    },
    {
      id: 2,
      title: 'Track Your',
      subtitle: 'Route',
      description: 'Monitor your route in real-time and never lose your way with our advanced GPS tracking.',
      buttonText: 'Continue',
      secondaryButtonText: 'Skip',
      backgroundColor: '#1A1A1A',
      accentColor: '#4ECDC4',
      icon: 'map',
      gradient: ['#1A1A1A', '#2D2D2D'],
    },
    {
      id: 3,
      title: 'Earn Badges',
      subtitle: '& Achievements',
      description: 'Unlock achievements and earn badges as you explore new places and complete challenges.',
      buttonText: 'Continue',
      secondaryButtonText: 'Skip',
      backgroundColor: '#1A1A1A',
      accentColor: '#FFD93D',
      icon: 'badge',
      gradient: ['#1A1A1A', '#2D2D2D'],
    },
    {
      id: 4,
      title: 'Share Your',
      subtitle: 'Adventures',
      description: 'Log your trips, share with friends and create lasting memories of your journeys.',
      buttonText: 'Start Exploring',
      secondaryButtonText: 'Skip',
      backgroundColor: '#1A1A1A',
      accentColor: '#6C5CE7',
      icon: 'share',
      gradient: ['#1A1A1A', '#2D2D2D'],
    },
  ];

  const LocationIcon = () => (
    <View style={[styles.iconContainer, {backgroundColor: '#FF6B35'}]}>
      <Svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );

  const MapIcon = () => (
    <View style={[styles.iconContainer, {backgroundColor: '#4ECDC4'}]}>
      <Svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );

  const BadgeIcon = () => (
    <View style={[styles.iconContainer, {backgroundColor: '#FFD93D'}]}>
      <Svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );

  const ShareIcon = () => (
    <View style={[styles.iconContainer, {backgroundColor: '#6C5CE7'}]}>
      <Svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <Path
          d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );

  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case 'location':
        return <LocationIcon />;
      case 'map':
        return <MapIcon />;
      case 'badge':
        return <BadgeIcon />;
      case 'share':
        return <ShareIcon />;
      default:
        return <LocationIcon />;
    }
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      scrollViewRef.current?.scrollTo({
        x: nextSlide * screenWidth,
        animated: true,
      });
    } else {
      onComplete();
    }
  };

  const handleScroll = (event: any) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    setCurrentSlide(slideIndex);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollView}
      >
        {slides.map((slide, index) => (
          <View
            key={slide.id}
            style={[
              styles.slide,
              {backgroundColor: slide.backgroundColor},
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Text style={styles.logo}>Wayfarian</Text>
              </View>
              <TouchableOpacity 
                style={styles.skipButton}
                onPress={onComplete}
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <View style={styles.iconSection}>
                {renderIcon(slide.icon)}
              </View>

              <View style={styles.textSection}>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={[styles.subtitle, {color: slide.accentColor}]}>{slide.subtitle}</Text>
                <Text style={styles.description}>{slide.description}</Text>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <View style={styles.pagination}>
                {slides.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === index && [styles.activeDot, {backgroundColor: slide.accentColor}],
                    ]}
                  />
                ))}
              </View>
              
              <TouchableOpacity
                style={[styles.nextButton, {backgroundColor: slide.accentColor}]}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>
                  {index === slides.length - 1 ? 'Get Started' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: screenWidth,
    height: screenHeight,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    flex: 1,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'System',
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconSection: {
    marginBottom: 60,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  textSection: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 42,
  },
  description: {
    color: '#B0B0B0',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: 40,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

export default OnboardingScreen;
