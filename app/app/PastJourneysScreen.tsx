import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';

interface Journey {
  id: string;
  title: string;
  date: string;
  imageUrl: string;
}

interface PastJourneysScreenProps {
  onBackPress?: () => void;
}

const PastJourneysScreen = ({ onBackPress }: PastJourneysScreenProps): React.JSX.Element => {
  const journeys: Journey[] = [
    {
      id: '1',
      title: 'Coastal Drive',
      date: '2023-08-15',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/XnFrxQkxNw.png',
    },
    {
      id: '2',
      title: 'Mountain Expedition',
      date: '2023-07-22',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/60izea1RSp.png',
    },
    {
      id: '3',
      title: 'Desert Crossing',
      date: '2023-06-10',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/HKahw9sEtu.png',
    },
    {
      id: '4',
      title: 'Forest Trail',
      date: '2023-05-05',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/XO9BiLfGpS.png',
    },
    {
      id: '5',
      title: 'City Escape',
      date: '2023-04-18',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/Z1gsBp3n06.png',
    },
    {
      id: '6',
      title: 'Lake Retreat',
      date: '2023-03-02',
      imageUrl: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/DBFsYcjdOn.png',
    },
  ];

  const BackIcon = () => (
    <Image
      source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/34Cwm3ER9G.svg' }}
      style={styles.backIcon}
    />
  );

  const MoreIcon = () => (
    <Image
      source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/EjRQemP1Fg.svg' }}
      style={styles.moreIcon}
    />
  );

  const ChevronIcon = () => (
    <Image
      source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/3KrGwd9oRq.svg' }}
      style={styles.chevronIcon}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBackPress}
          activeOpacity={0.7}
        >
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Journeys</Text>
        <TouchableOpacity style={styles.moreButton} activeOpacity={0.7}>
          <MoreIcon />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {journeys.map((journey) => (
          <TouchableOpacity
            key={journey.id}
            style={styles.journeyItem}
            activeOpacity={0.7}
          >
            <View style={styles.journeyContent}>
              <Image source={{ uri: journey.imageUrl }} style={styles.journeyImage} />
              <View style={styles.journeyInfo}>
                <Text style={styles.journeyTitle}>{journey.title}</Text>
                <Text style={styles.journeyDate}>{journey.date}</Text>
              </View>
            </View>
            <View style={styles.chevronContainer}>
              <ChevronIcon />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.bottomNavigation}>
        <View style={styles.floatingButton}>
          <Image
            source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/mKBNFLiEUx.svg' }}
            style={styles.floatingButtonIcon}
          />
        </View>
        <View style={styles.homeIndicator} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 23,
    textAlign: 'center',
    flex: 1,
  },
  moreButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreIcon: {
    width: 24,
    height: 24,
  },
  scrollView: {
    flex: 1,
  },
  journeyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  journeyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  journeyImage: {
    width: 100,
    height: 56,
    borderRadius: 8,
    marginRight: 16,
  },
  journeyInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  journeyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginBottom: 2,
  },
  journeyDate: {
    fontSize: 14,
    fontWeight: '400',
    color: '#757575',
    fontFamily: 'Space Grotesk',
    lineHeight: 21,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronIcon: {
    width: 24,
    height: 24,
  },
  bottomNavigation: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'flex-end',
  },
  floatingButton: {
    width: 64,
    height: 56,
    backgroundColor: '#3E4751',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  floatingButtonIcon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  homeIndicator: {
    width: 390,
    height: 20,
    backgroundColor: 'transparent',
  },
});

export default PastJourneysScreen;
