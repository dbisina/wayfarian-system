// One map look for every map screen, on iOS and Android alike. Both use Google Maps so the custom
// style (the app's own warm colours, quiet labels, no shop/transit clutter) applies on both.

import { Platform } from 'react-native';
import { PROVIDER_GOOGLE, type Provider } from 'react-native-maps';

export const mapProvider: Provider = PROVIDER_GOOGLE;

export const mapStyle = (dark: boolean) => {
  const c = dark
    ? { land: '#161513', poi: '#1E1C19', road: '#2A2723', major: '#38332B', water: '#132029', text: '#A29B8D', stroke: '#161513' }
    : { land: '#ECE6D9', poi: '#E2DBCB', road: '#FFFDF8', major: '#FFFDF8', water: '#C9DCDD', text: '#625C51', stroke: '#ECE6D9' };
  return [
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { elementType: 'labels.text.fill', stylers: [{ color: c.text }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.stroke }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: c.road }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: c.major }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: c.poi }] },
  ];
};

/** Props every MapView spreads so the look matches the design everywhere. */
export const mapLook = (dark: boolean) => ({
  provider: mapProvider,
  customMapStyle: mapStyle(dark),
  toolbarEnabled: Platform.OS === 'android' ? false : undefined,
});
