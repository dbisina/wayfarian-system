// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The shared ride stats engine lives outside the app folder. Metro compiles its TypeScript
// source directly, so the app and the server run exactly the same code.
const rideCore = path.resolve(__dirname, '../packages/ride-core');
config.watchFolders = [...(config.watchFolders || []), rideCore];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@wayfarian/ride-core': path.join(rideCore, 'src'),
};

module.exports = config;
