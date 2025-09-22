import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import Svg, {Path, Circle} from 'react-native-svg';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

interface OnboardingScreenProps {
  onComplete: () => void;
}

const OnboardingScreen = ({onComplete}: OnboardingScreenProps): React.ReactElement => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const slides = [
    {
      id: 1,
      title: 'Start Your',
      subtitle: 'Journey',
      description: 'Your travel story for saving memories, achievements and relating every mile.',
      buttonText: 'START YOUR STORY',
      secondaryButtonText: 'TRAVEL THE WORLD',
      backgroundColor: '#2C2C2C',
      icon: 'location',
    },
    {
      id: 2,
      title: 'Track twists',
      subtitle: 'and turns.',
      description: 'Monitor your route in real-time and never lose your way.',
      backgroundColor: '#2C2C2C',
      icon: 'map',
    },
    {
      id: 3,
      title: 'Earn Badges',
      subtitle: 'with every',
      description: 'adventure.',
      backgroundColor: '#2C2C2C',
      icon: 'people',
    },
    {
      id: 4,
      title: 'Track Your',
      subtitle: 'Journey.',
      description: 'Log your trips, share with friends and earn your badges.',
      backgroundColor: '#1E3A8A',
      icon: 'journey',
    },
  ];

  const LocationIcon = () => (
    <Svg width="60" height="60" viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        fill="#FFA500"
      />
    </Svg>
  );

  const MapIcon = () => (
    <View style={styles.mapIconContainer}>
      <Svg width="80" height="80" viewBox="0 0 100 100" fill="none">
        <Circle cx="50" cy="40" r="25" fill="#FFA500" />
        <Path
          d="M20 60 Q50 40 80 60 Q50 80 20 60"
          stroke="#FFA500"
          strokeWidth="3"
          fill="none"
        />
      </Svg>
    </View>
  );

  const PeopleIcon = () => (
    <Image
      source={{uri: 'https://dummyimage.com/200x150/2C2C2C/ffffff?text=Group+Adventure'}}
      style={styles.peopleImage}
      referrerpolicy="no-referrer"
    />
  );

  const JourneyIcon = () => (
    <Svg width="60" height="60" viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="#FFA500"
      />
    </Svg>
  );

  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case 'location':
        return <LocationIcon />;
      case 'map':
        return <MapIcon />;
      case 'people':
        return <PeopleIcon />;
      case 'journey':
        return <JourneyIcon />;
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
            <View style={styles.header}>
              <Text style={styles.logo}>LOGO</Text>
              <Text style={styles.slideNumber}>
                onboarding {slide.id}
              </Text>
            </View>

            <View style={styles.content}>
              <View style={styles.textContainer}>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.subtitle}>{slide.subtitle}</Text>
                <Text style={styles.description}>{slide.description}</Text>
              </View>

              <View style={styles.iconContainer}>
                {renderIcon(slide.icon)}
              </View>

              {slide.id === 1 && (
                <View style={styles.buttonContainer}>
                  <TouchableOpacity style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>
                      {slide.buttonText}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      {slide.secondaryButtonText}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <View style={styles.pagination}>
                {slides.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === index && styles.activeDot,
                    ]}
                  />
                ))}
              </View>
              
              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>
                  {index === slides.length - 1 ? 'GET STARTED' : 'NEXT'}
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
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: screenWidth,
    height: screenHeight,
    paddingHorizontal: 20,
    paddingVertical: 50,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  logo: {
    color: '#FFA500',
    fontSize: 16,
    fontWeight: 'bold',
  },
  slideNumber: {
    color: '#888',
    fontSize: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    textAlign: 'center',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    color: '#CCCCCC',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
  },
  mapIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    marginBottom: 15,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#FFA500',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 200,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFA500',
    fontSize: 14,
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: 30,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#555',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#FFA500',
    width: 24,
  },
  nextButton: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 200,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default OnboardingScreen;
