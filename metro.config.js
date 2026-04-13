const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add alias for legacy @unimodules/core to modern expo-modules-core
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@unimodules/core': require.resolve('expo-modules-core'),
};

module.exports = config;
