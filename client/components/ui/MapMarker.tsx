import React from 'react';
import {
  View,
  Image,
  StyleSheet,
} from 'react-native';

interface MapMarkerProps {
  marker: {
    id: number;
    x: number;
    y: number;
    type: string;
    image: string;
  };
}

const MapMarker = ({ marker }: MapMarkerProps) => {
  return (
    <View 
      style={[
        styles.mapMarker,
        styles[`mapMarker${marker.type.charAt(0).toUpperCase() + marker.type.slice(1)}`],
        {
          left: marker.x,
          top: marker.y,
        }
      ]}
    >
      <Image 
        source={{ uri: marker.image }}
        style={styles.markerImage}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mapMarker: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapMarkerUser: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  mapMarkerPerson: {
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
});

export default MapMarker;
