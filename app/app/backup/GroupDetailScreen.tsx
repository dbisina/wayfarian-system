import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  Image,
} from 'react-native';

interface GroupDetailScreenProps {
  onBack?: () => void;
}

const GroupDetailScreen = ({onBack}: GroupDetailScreenProps): JSX.Element => {
  const upcomingTrips = [
    {
      id: '1',
      name: 'Mountain Escape',
      date: 'Oct 22',
      duration: '8 days',
      image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/pr9ePNq8zj.png',
    },
  ];

  const pastTrips = [
    {
      id: '1',
      name: 'Safari',
      date: '2 weeks ago',
      duration: '1 day trip',
      image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/wPBAZyenbZ.png',
    },
    {
      id: '2',
      name: 'Safari',
      date: '2 weeks ago',
      duration: '1 day trip',
      image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/RPGW1kAic2.png',
    },
  ];

  const memberAvatars = [
    'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/p4a0gQAVdB.png',
    'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/iLJE1HFcaK.png',
    'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/VJvQsZV3qU.png',
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerContainer}>
        <ImageBackground
          source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/JZ3jr2uMKu.png'}}
          style={styles.headerImage}
          imageStyle={styles.headerImageStyle}>
          <View style={styles.headerOverlay}>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Image
                source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/r3fuE1UJoQ.svg'}}
                style={styles.backIcon}
              />
            </TouchableOpacity>
            
            <Text style={styles.groupTitle}>Road Trip Crew</Text>
            
            <View style={styles.membersContainer}>
              <View style={styles.membersStack}>
                {memberAvatars.map((avatar, index) => (
                  <Image
                    key={index}
                    source={{uri: avatar}}
                    style={[
                      styles.memberAvatar,
                      {
                        top: index * 37,
                        zIndex: memberAvatars.length - index,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
            
            <View style={styles.groupInfoContainer}>
              <Image
                source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/ns4AOr4Vp1.png'}}
                style={styles.groupInfo}
              />
            </View>
          </View>
        </ImageBackground>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming trips</Text>
          
          {upcomingTrips.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              <ImageBackground
                source={{uri: trip.image}}
                style={styles.tripImage}
                imageStyle={styles.tripImageStyle}>
                <View style={styles.tripOverlay}>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripName}>{trip.name}</Text>
                    <View style={styles.tripDetails}>
                      <Text style={styles.tripDate}>{trip.date}</Text>
                      <Text style={styles.tripDot}>.</Text>
                      <Text style={styles.tripDuration}>{trip.duration}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.playButton}>
                    <Image
                      source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/xUF5uaCNfF.svg'}}
                      style={styles.playIcon}
                    />
                  </TouchableOpacity>
                </View>
              </ImageBackground>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Past Trips</Text>
          
          {pastTrips.map((trip, index) => (
            <View key={trip.id + index} style={styles.tripCard}>
              <ImageBackground
                source={{uri: trip.image}}
                style={styles.pastTripImage}
                imageStyle={styles.tripImageStyle}>
                <View style={styles.tripOverlay}>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripName}>{trip.name}</Text>
                    <View style={styles.tripDetails}>
                      <Text style={styles.pastTripDate}>{trip.date}</Text>
                      <Text style={styles.tripDot}>.</Text>
                      <Text style={styles.pastTripDuration}>{trip.duration}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.playButton}>
                    <Image
                      source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-19/iT9WOLo3Bb.svg'}}
                      style={styles.playIcon}
                    />
                  </TouchableOpacity>
                </View>
              </ImageBackground>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    height: 275,
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerImageStyle: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    textAlign: 'center',
    position: 'absolute',
    top: 28,
    left: 134,
    width: 122,
  },
  membersContainer: {
    position: 'absolute',
    right: 16,
    top: 99,
  },
  membersStack: {
    width: 46,
    height: 113,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    position: 'relative',
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  memberAvatar: {
    width: 36,
    height: 35,
    borderRadius: 5,
    position: 'absolute',
    left: 5,
  },
  groupInfoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
  },
  groupInfo: {
    width: 62,
    height: 20,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 23,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginBottom: 13,
  },
  tripCard: {
    marginBottom: 13,
  },
  tripImage: {
    width: '100%',
    height: 147,
  },
  pastTripImage: {
    width: '100%',
    height: 126,
  },
  tripImageStyle: {
    borderRadius: 10,
  },
  tripOverlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    justifyContent: 'flex-end',
    padding: 0,
  },
  tripInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 51,
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  tripName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginBottom: 2,
  },
  tripDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripDate: {
    fontSize: 10,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
  pastTripDate: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
  tripDot: {
    fontSize: 8,
    fontWeight: '300',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
    marginHorizontal: 3,
  },
  tripDuration: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
  pastTripDuration: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'Space Grotesk',
    lineHeight: 24,
  },
  playButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 30,
    height: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  playIcon: {
    width: 15.7,
    height: 21.69,
    tintColor: '#000000',
  },
});

export default GroupDetailScreen;
