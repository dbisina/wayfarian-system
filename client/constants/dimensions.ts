import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const ScreenDimensions = {
  width: screenWidth,
  height: screenHeight,
};

export const ComponentDimensions = {
  searchBar: {
    width: 360,
    height: 50,
    borderRadius: 12,
    marginHorizontal: 15,
    marginTop: 28,
  },
  categoryButton: {
    height: 22,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginTop: 91,
    marginLeft: 15,
  },
  floatingButton: {
    location: {
      size: 50,
      borderRadius: 50,
      padding: { horizontal: 12, vertical: 13 },
    },
    layers: {
      size: 50,
      borderRadius: 12,
      padding: { horizontal: 11, vertical: 10 },
    },
  },
};
