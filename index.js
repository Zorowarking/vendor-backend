import { registerRootComponent } from 'expo';

import App from './App';
import messaging from '@react-native-firebase/messaging';
import { systemBubbleService } from './services/systemBubbleService';

// Handle background messages
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM] Message handled in the background!', remoteMessage);
  
  const { type, bubble_active, badge_count } = remoteMessage.data || {};
  
  if (type === 'BUBBLE_UPDATE') {
    const count = parseInt(badge_count || '0');
    const active = bubble_active === 'true';
    
    if (active) {
      systemBubbleService.show();
    } else {
      systemBubbleService.hide();
    }
  }
});

registerRootComponent(App);
