import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import { systemBubbleService } from './services/systemBubbleService';
// Handle background messages for FCM
try {
  // Only attempt to load and use messaging if we are in a native environment (not Expo Go)
  const { NativeModules } = require('react-native');
  if (NativeModules.RNFBMessagingModule) {
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('[FCM] Message handled in the background!', remoteMessage);
      
      const { type, bubble_active } = remoteMessage.data || {};
      
      if (type === 'BUBBLE_UPDATE') {
        const active = bubble_active === 'true';
        if (active) {
          systemBubbleService.show();
        } else {
          systemBubbleService.hide();
        }
      }
    });
  }
} catch (e) {
  console.warn('FCM Background handler initialization failed (Safe in Expo Go):', e);
}

// Bootstrap Expo Router
export function App() {
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
