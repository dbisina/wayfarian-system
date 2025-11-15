import type { ConfigContext, ExpoConfig } from 'expo/config';

const baseConfig = require('./app.json');

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleMapsKey) {
    console.warn('⚠️ EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not defined. Maps features may fail.');
  }

  const expoConfig: ExpoConfig = {
    ...baseConfig.expo,
    ...config,
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
      googleMapsApiKey: googleMapsKey ?? '',
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
