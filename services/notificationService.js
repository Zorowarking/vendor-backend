import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Register device and get push token
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = 
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission denied');
    return null;
  }

  // Android channel setup
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'New Orders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B35',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('kyc', {
      name: 'KYC Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B35',
      sound: 'default',
    });
  }

  // Get push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId 
      ?? Constants.easConfig?.projectId;
    
    if (!projectId) {
      console.warn('No EAS projectId found in app config');
      return null;
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return pushTokenData.data;
  } catch (error) {
    console.warn('Failed to get push token:', error);
    return null;
  }
}

// Save token to backend
export async function savePushTokenToBackend(token, apiInstance) {
  if (!token) return;
  try {
    await apiInstance.post('/vendor/push-token', { pushToken: token });
    console.log('Push token saved to backend');
  } catch (error) {
    // Silent fail — don't crash app if token save fails
    console.warn('Could not save push token:', error);
  }
}

// Setup notification listeners (call in _layout.js)
export function setupNotificationListeners(
  onNotificationReceived,
  onNotificationTapped
) {
  // Fires when notification received while app is OPEN
  const receivedSub = Notifications.addNotificationReceivedListener(
    notification => {
      if (onNotificationReceived) onNotificationReceived(notification);
    }
  );

  // Fires when user TAPS a notification
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    response => {
      if (onNotificationTapped) onNotificationTapped(response);
    }
  );

  // Return cleanup function
  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
