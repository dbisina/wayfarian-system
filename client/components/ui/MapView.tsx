import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import MapMarker from './MapMarker';

interface MapMarkerData {
  id: number;
  x: number;
  y: number;
  type: string;
  image: string;
}

interface MapViewProps {
  markers: MapMarkerData[];
  onAddMarker: () => void;
}

const MapView = ({ markers, onAddMarker }: MapViewProps) => {
  return (
    <TouchableOpacity style={styles.mapView} onPress={onAddMarker} activeOpacity={0.9}>
      <Image 
        source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/hVwN5eWoXB.png' }}
        style={styles.mapBackground}
        resizeMode="cover"
      />
      <View style={styles.mapMarkers}>
        {markers.map(marker => (
          <MapMarker 
            key={marker.id} 
            marker={marker} 
          />
        ))}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  mapView: {
    height: 300,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mapBackground: {
    width: '100%',
    height: '100%',
  },
  mapMarkers: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default MapView;
