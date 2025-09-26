import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const JourneyScreen = () => {
  const friendProfiles = [
    { id: 1, avatar: 'https://static.codia.ai/image/2025-09-26/byc45z4XPi.png' },
    { id: 2, avatar: 'https://static.codia.ai/image/2025-09-26/nNFdUZfheL.png' },
    { id: 3, avatar: 'https://static.codia.ai/image/2025-09-26/yAQdwAryr1.png' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Background Map Image */}
      <Image
        source={{ uri: 'https://static.codia.ai/image/2025-09-26/CwL1fB7pEK.png' }}
        style={styles.backgroundMap}
        resizeMode="cover"
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/qjy0a6B7aU.png' }}
            style={styles.profileImage}
          />
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/zoBaNRyFNQ.png' }}
            style={styles.menuIcon}
          />
        </View>
        <View style={styles.headerRight}>
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/WTtXWrq4i5.png' }}
            style={styles.profileImage}
          />
          <Image
            source={{ uri: 'https://static.codia.ai/image/2025-09-26/cHSt8mM9zp.png' }}
            style={styles.settingsIcon}
          />
        </View>
      </View>

      {/* Friend Location Markers */}
      <View style={styles.friendMarker1}>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/4BdU4s8vca.png' }}
          style={styles.friendMarkerImage}
        />
      </View>

      <View style={styles.friendMarker2}>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/fNvNPcPMf0.png' }}
          style={styles.friendMarkerImage}
        />
      </View>

      <View style={styles.friendMarker3}>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/Njgbg8n3jJ.png' }}
          style={styles.friendMarkerImage}
        />
      </View>

      {/* SOS Button */}
      <TouchableOpacity style={styles.sosButton}>
        <Image
          source={{ uri: 'https://static.codia.ai/image/2025-09-26/cGkBkJPGTf.png' }}
          style={styles.sosBackground}
        />
        <Text style={styles.sosText}>SOS</Text>
      </TouchableOpacity>

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        {/* Friends Row */}
        <View style={styles.friendsRow}>
          <View style={styles.friendsContainer}>
            {friendProfiles.map((friend) => (
              <Image
                key={friend.id}
                source={{ uri: friend.avatar }}
                style={styles.friendAvatar}
              />
            ))}
            <View style={styles.addFriendButton}>
              <Text style={styles.addFriendText}>+</Text>
            </View>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>00:00</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.statItem}>
            <View style={styles.speedContainer}>
              <Text style={styles.statValue}>0.0</Text>
              <Text style={styles.speedUnit}>KPH</Text>
            </View>
            <Text style={styles.statLabel}>Speed</Text>
          </View>
          <View style={styles.statItem}>
            <View style={styles.distanceContainer}>
              <Text style={styles.statValue}>0.00</Text>
              <Text style={styles.distanceUnit}>KM</Text>
            </View>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.startButton}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/s27abcBOgz.png' }}
              style={styles.startIcon}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton}>
            <Image
              source={{ uri: 'https://static.codia.ai/image/2025-09-26/oaseCkwYnL.png' }}
              style={styles.shareIcon}
            />
            <Text style={styles.shareText}>Share live location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundMap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
  },
  menuIcon: {
    width: 24,
    height: 24,
    position: 'absolute',
    left: 11,
    top: 10.5,
  },
  settingsIcon: {
    width: 24,
    height: 24,
    position: 'absolute',
    right: 11,
    top: 2.5,
  },
  friendMarker1: {
    position: 'absolute',
    left: 38,
    top: 422,
  },
  friendMarker2: {
    position: 'absolute',
    left: 314,
    top: 224,
  },
  friendMarker3: {
    position: 'absolute',
    left: 266,
    top: 466,
  },
  friendMarkerImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#0F2424',
  },
  sosButton: {
    position: 'absolute',
    right: 15,
    top: 582,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBackground: {
    position: 'absolute',
    width: 30,
    height: 30,
  },
  sosText: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
    color: '#FFFFFF',
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 251, 251, 0.9)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    height: 215,
  },
  friendsRow: {
    paddingBottom: 12,
  },
  friendsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  addFriendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendText: {
    fontSize: 20,
    color: '#666666',
    fontWeight: '300',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  statItem: {
    alignItems: 'flex-start',
  },
  statValue: {
    fontFamily: 'Poppins',
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 39,
    color: '#000000',
  },
  statLabel: {
    fontFamily: 'Poppins',
    fontSize: 10,
    lineHeight: 15,
    color: '#202020',
  },
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  speedUnit: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    color: '#000000',
    marginLeft: 4,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distanceUnit: {
    fontFamily: 'Poppins',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    color: '#000000',
    marginLeft: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 8,
  },
  startButton: {
    backgroundColor: '#BEFFA7',
    borderRadius: 12,
    width: 120,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startIcon: {
    width: 24,
    height: 24,
  },
  shareButton: {
    backgroundColor: 'rgba(255, 251, 251, 0.8)',
    borderRadius: 12,
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2.2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  shareIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  shareText: {
    fontFamily: 'Poppins',
    fontSize: 14,
    lineHeight: 21,
    color: '#000000',
  },
});

export default JourneyScreen;
