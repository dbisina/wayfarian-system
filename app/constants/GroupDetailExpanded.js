import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GroupDetailExpanded = () => {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header Image with Overlay */}
        <View style={styles.headerContainer}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/TLVU12RXWd.png' }}
            style={styles.headerImage}
          />
          <LinearGradient
            colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.3)']}
            style={styles.headerOverlay}
          />
          
          {/* Back Button */}
          <TouchableOpacity style={styles.backButton}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/PkQ8JtFpqq.png' }}
              style={styles.backIcon}
            />
          </TouchableOpacity>
          
          {/* Group Title */}
          <Text style={styles.groupTitle}>Road Trip Crew</Text>
          
          {/* Member Avatars Stack */}
          <View style={styles.avatarStack}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/Ha9BTdBKER.png' }}
              style={styles.avatarContainer}
            />
            <View style={styles.avatar1}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/nYT3NXd6kT.png' }}
                style={styles.avatarImage}
              />
            </View>
            <View style={styles.avatar2}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/nYT3NXd6kT.png' }}
                style={styles.avatarImage}
              />
            </View>
            <View style={styles.avatar3}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/AuSwH1po1o.png' }}
                style={styles.avatarImage}
              />
            </View>
            <View style={styles.avatar4}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/e3nhUuQzps.png' }}
                style={styles.avatarImage}
              />
              <LinearGradient
                colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.7)']}
                style={styles.avatarOverlay}
              />
              <Text style={styles.moreCount}>+10</Text>
            </View>
          </View>
          
          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/G1OXt3BdJZ.png' }}
              style={styles.shareIcon}
            />
          </TouchableOpacity>
          
          {/* Rating */}
          <View style={styles.ratingContainer}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/JEH2tiEiL4.png' }}
              style={styles.ratingBackground}
            />
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/xyNKn1hdhx.png' }}
              style={styles.ratingStars}
            />
          </View>
        </View>

        {/* Upcoming Trips Section */}
        <Text style={styles.sectionTitle}>Upcoming trips</Text>
        
        <View style={styles.contentCard}>
          {/* Trip Card */}
          <View style={styles.tripCard}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/LTXaqwn6od.png' }}
              style={styles.tripImage}
            />
            <View style={styles.tripOverlay}>
              <View style={styles.tripInfo}>
                <Text style={styles.tripTitle}>Mountain Escape</Text>
                <Text style={styles.tripDate}>Oct 22</Text>
              </View>
              <TouchableOpacity style={styles.playButton}>
                <Image
                  source={{ uri: 'https://static.codia.ai/image/2025-09-26/qB5oPwExsU.png' }}
                  style={styles.playIcon}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Overview Section */}
          <Text style={styles.overviewTitle}>Overview</Text>
          
          <View style={styles.descriptionContainer}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/PQ0dy3DzXA.png' }}
              style={styles.locationIcon}
            />
            <Text style={styles.description}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. In iaculis eros sed pretium eleifend. Maecenas hendrerit luctus accumsan.{'\n\n'}
              Nullam lorem orci, viverra ut mauris vitae, interdum vestibulum diam. Nullam in nulla sed orci condimentum iaculis. Integer orci massa, dapibus eget ornare ac, dignissim non diam.
            </Text>
          </View>

          {/* Join Group Button */}
          <TouchableOpacity style={styles.joinButton}>
            <Text style={styles.joinButtonText}>Join group</Text>
          </TouchableOpacity>
        </View>

        {/* Past Trips Section */}
        <Text style={styles.sectionTitle}>Past Trips</Text>
        
        {/* Past Trip 1 */}
        <View style={styles.pastTripCard}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/kVuHV2t72W.png' }}
            style={styles.pastTripImage}
          />
          <View style={styles.tripOverlay}>
            <View style={styles.tripInfo}>
              <Text style={styles.tripTitle}>Safari</Text>
              <Text style={styles.tripDate}>2 weeks ago</Text>
            </View>
            <TouchableOpacity style={styles.playButton}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/UtjvnghROZ.png' }}
                style={styles.playIcon}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Past Trip 2 */}
        <View style={styles.pastTripCard}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/18KjnBf2w3.png' }}
            style={styles.pastTripImage}
          />
          <View style={styles.tripOverlay}>
            <View style={styles.tripInfo}>
              <Text style={styles.tripTitle}>Safari</Text>
              <Text style={styles.tripDate}>1 month ago</Text>
            </View>
            <TouchableOpacity style={styles.playButton}>
              <Image
                source={{ uri: 'https://static.codia.ai/image/2025-09-26/KFZy8edaZV.png' }}
                style={styles.playIcon}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  headerContainer: {
    position: 'relative',
    width: 390,
    height: 278,
  },
  headerImage: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 48,
    height: 48,
  },
  backIcon: {
    width: 48,
    height: 48,
  },
  groupTitle: {
    position: 'absolute',
    top: 28,
    left: 134,
    fontFamily: 'Space Grotesk',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
  },
  avatarStack: {
    position: 'absolute',
    top: 75,
    right: 24,
    width: 35,
    height: 110,
  },
  avatarContainer: {
    width: 35,
    height: 110,
    borderRadius: 3,
  },
  avatar1: {
    position: 'absolute',
    top: 2,
    left: 4,
    width: 27,
    height: 24,
    borderRadius: 3,
    overflow: 'hidden',
  },
  avatar2: {
    position: 'absolute',
    top: 28,
    left: 4,
    width: 27,
    height: 24,
    borderRadius: 3,
    overflow: 'hidden',
  },
  avatar3: {
    position: 'absolute',
    top: 55,
    left: 2,
    width: 32,
    height: 25,
    borderRadius: 3,
    overflow: 'hidden',
  },
  avatar4: {
    position: 'absolute',
    top: 83,
    left: 4,
    width: 27,
    height: 24,
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 3,
  },
  moreCount: {
    position: 'absolute',
    fontWeight: '400',
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  shareButton: {
    position: 'absolute',
    bottom: 37,
    left: 17,
    width: 22,
    height: 22,
  },
  shareIcon: {
    width: 22,
    height: 22,
  },
  ratingContainer: {
    position: 'absolute',
    bottom: 40,
    left: 13,
    width: 72,
    height: 24,
  },
  ratingBackground: {
    width: 72,
    height: 24,
  },
  ratingStars: {
    position: 'absolute',
    top: 2,
    left: 5,
    width: 62,
    height: 20,
  },
  sectionTitle: {
    marginTop: 20,
    marginLeft: 16,
    fontFamily: 'Space Grotesk',
    fontWeight: '500',
    fontSize: 16,
    color: '#000000',
  },
  contentCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  tripCard: {
    position: 'relative',
    width: '100%',
    height: 147,
  },
  tripImage: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  tripOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 39,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
  },
  tripInfo: {
    flex: 1,
  },
  tripTitle: {
    fontFamily: 'Space Grotesk',
    fontWeight: '700',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 3,
  },
  tripDate: {
    fontFamily: 'Space Grotesk',
    fontWeight: '400',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  playButton: {
    width: 30,
    height: 30,
  },
  playIcon: {
    width: 30,
    height: 30,
  },
  overviewTitle: {
    marginTop: 12,
    marginLeft: 12,
    fontFamily: 'Space Grotesk',
    fontSize: 12,
    color: '#000000',
  },
  descriptionContainer: {
    flexDirection: 'row',
    marginTop: 12,
    marginHorizontal: 12,
    alignItems: 'flex-start',
  },
  locationIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
    marginTop: 2,
  },
  description: {
    flex: 1,
    fontFamily: 'Space Grotesk',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 18,
    color: '#000000',
    textAlign: 'justify',
  },
  joinButton: {
    marginHorizontal: 10,
    marginVertical: 20,
    backgroundColor: '#F9A825',
    borderRadius: 5,
    paddingVertical: 8,
    alignItems: 'center',
  },
  joinButtonText: {
    fontFamily: 'Space Grotesk',
    fontWeight: '700',
    fontSize: 16,
    color: '#FFFFFF',
  },
  pastTripCard: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 10,
    height: 126,
    borderRadius: 10,
    overflow: 'hidden',
  },
  pastTripImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
});

export default GroupDetailExpanded;
