import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

const CreateJoinSection = (): JSX.Element => {
  const handleCreateGroup = () => {
    console.log('Create Group pressed');
  };

  const handleJoinGroup = () => {
    console.log('Join Group pressed');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.sectionTitle}>Create or Join</Text>
      </View>
      
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateGroup}>
          <Text style={styles.createButtonText}>Create Group</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.joinButton} onPress={handleJoinGroup}>
          <Text style={styles.joinButtonText}>Join Group</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 20,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    color: '#000000',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  createButton: {
    flex: 1,
    maxWidth: 181,
    height: 40,
    backgroundColor: '#0D80F2',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  createButtonText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 21,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  joinButton: {
    flex: 1,
    maxWidth: 165,
    height: 40,
    backgroundColor: '#3E4751',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  joinButtonText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 21,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default CreateJoinSection;
