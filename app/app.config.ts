import type { ConfigContext, ExpoConfig } from 'expo/config';

import 'dotenv/config';
const baseConfig = require('./app.json');

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleMapsKey) {
    console.warn('⚠️ EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not defined. Maps features may fail.');
  }

  const expoConfig: ExpoConfig = {
    ...baseConfig.expo,
    ...config,
    plugins: [
      ...(baseConfig.expo?.plugins ?? []),
      ...(config?.plugins ?? []),
      // Note: react-native-maps config plugin not available in v1.20.1
      // API keys are configured via ios.config.googleMapsApiKey and android.config.googleMaps.apiKey
    ],
    extra: {
      ...baseConfig.expo?.extra,
      ...config?.extra,
      googleMapsApiKey: googleMapsKey,
    },
  };

  expoConfig.ios = {
    ...baseConfig.expo?.ios,
    ...config?.ios,
    config: {
      ...(baseConfig.expo?.ios?.config ?? {}),
      ...(config?.ios?.config ?? {}),
      // Using Apple Maps (MapKit) on iOS - no Google Maps API key needed
    },
  };

  expoConfig.android = {
    ...baseConfig.expo?.android,
    ...config?.android,
    config: {
      ...(baseConfig.expo?.android?.config ?? {}),
      ...(config?.android?.config ?? {}),
      googleMaps: {
        ...(baseConfig.expo?.android?.config?.googleMaps ?? {}),
        ...(config?.android?.config?.googleMaps ?? {}),
        apiKey: googleMapsKey ?? '',
      },
    },
  };

  return expoConfig;
};
