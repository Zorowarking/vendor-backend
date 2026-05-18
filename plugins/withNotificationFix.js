const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotificationFix(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];

    // Ensure mainApplication has meta-data list initialized
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    // Helper to add or replace meta-data
    const setMetaData = (name, value, type = 'resource') => {
      let metaData = mainApplication['meta-data'].find(
        (item) => item.$ && item.$['android:name'] === name
      );

      if (!metaData) {
        metaData = { $: { 'android:name': name } };
        mainApplication['meta-data'].push(metaData);
      }

      metaData.$[`android:${type}`] = value;
      metaData.$['tools:replace'] = `android:${type}`;
    };

    // Ensure tools namespace exists
    if (!config.modResults.manifest.$) {
      config.modResults.manifest.$ = {};
    }
    config.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Apply fixes
    setMetaData('com.google.firebase.messaging.default_notification_color', '@color/notification_icon_color');
    setMetaData('com.google.firebase.messaging.default_notification_channel_id', 'default', 'value');

    return config;
  });
};
