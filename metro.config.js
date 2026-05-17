const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Prevent tree-shaking and ensure all module formats are fully resolved
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

// Add alias for legacy @unimodules/core to modern expo-modules-core
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@unimodules/core': path.dirname(require.resolve('expo-modules-core/package.json')),
  '@react-native-community/netinfo': path.resolve(__dirname, 'node_modules/@react-native-community/netinfo'),
};

module.exports = config;
