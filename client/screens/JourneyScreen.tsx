import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Header from '../components/ui/Header';
import StatsPanel from '../components/ui/StatsPanel';
import ActionButtons from '../components/ui/ActionButtons';
import MapView from '../components/ui/MapView';
import BottomNavigation from '../components/navigation/BottomNavigation';

interface JourneyStats {
  time: string;
  speed: number;
  distance: number;
}

interface MapMarker {
  id: number;
  x: number;
  y: number;
  type: string;
  image: string;
}

export default function JourneyScreen() {
  const [journeyStats, setJourneyStats] = useState<JourneyStats>({
    time: '00:00',
    speed: 0.0,
    distance: 0.00
  });

  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([
    { id: 1, x: 38, y: 422, type: 'user', image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/OX8PQHshH9.png' },
    { id: 2, x: 314, y: 224, type: 'person', image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/mx4Mqgbmd5.png' },
    { id: 3, x: 305, y: 507, type: 'person', image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/JVj5t81aFk.png' }
  ]);

  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking) {
      interval = setInterval(() => {
        setJourneyStats(prev => ({
          ...prev,
          time: updateTime(prev.time),
          speed: parseFloat((Math.random() * 25).toFixed(1)),
          distance: parseFloat((prev.distance + 0.01).toFixed(2))
        }));
        
        // Simulate marker movement
        setMapMarkers(prev => prev.map(marker => ({
          ...marker,
          x: marker.x + (Math.random() - 0.5) * 2,
          y: marker.y + (Math.random() - 0.5) * 2
        })));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking]);

  const updateTime = (currentTime: string): string => {
    const [minutes, seconds] = currentTime.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds + 1;
    const newMinutes = Math.floor(totalSeconds / 60);
    const newSeconds = totalSeconds % 60;
    return `${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
  };

  const handleStartTracking = () => {
    setIsTracking(!isTracking);
  };

  const addRandomMarker = () => {
    const newMarker: MapMarker = {
      id: Date.now(),
      x: Math.random() * 350 + 20,
      y: Math.random() * 400 + 200,
      type: 'person',
      image: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-08-14/mx4Mqgbmd5.png'
    };
    setMapMarkers(prev => [...prev, newMarker]);
  };

  return (
    <View style={styles.container}>
      <Header />
      <ScrollView style={styles.content}>
        <MapView markers={mapMarkers} onAddMarker={addRandomMarker} />
        <View style={styles.journeyPanel}>
          <StatsPanel stats={journeyStats} />
          <ActionButtons 
            isTracking={isTracking} 
            onStartTracking={handleStartTracking} 
          />
        </View>
      </ScrollView>
      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  content: {
    flex: 1,
  },
  journeyPanel: {
    padding: 16,
    gap: 16,
  },
});
