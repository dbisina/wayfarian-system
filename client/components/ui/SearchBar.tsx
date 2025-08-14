import React from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

const SearchBar: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.searchBar} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 28,
    left: 15,
    right: 15,
    zIndex: 2,
  },
  searchBar: {
    width: screenWidth - 30, // 360px with 15px margins
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default SearchBar;
