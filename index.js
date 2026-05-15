import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import messaging from '@react-native-firebase/messaging';
import { systemBubbleService } from './services/systemBubbleService';

// Handle background messages for FCM
try {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('[FCM] Message handled in the background!', remoteMessage);
    
    const { type, bubble_active, badge_count } = remoteMessage.data || {};
    
    if (type === 'BUBBLE_UPDATE') {
      const active = bubble_active === 'true';
      
      if (active) {
        systemBubbleService.show();
      } else {
        systemBubbleService.hide();
      }
    }
  });
} catch (e) {
  console.warn('FCM Background handler initialization failed:', e);
}

// Bootstrap Expo Router
export function App() {
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
