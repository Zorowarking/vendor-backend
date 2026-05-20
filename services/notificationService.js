import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ─── Foreground Notification Handler ─────────────────────────────────────────
// Controls how notifications look when the app is in the FOREGROUND
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Deduplication Set ────────────────────────────────────────────────────────
// Prevents the same notification from being processed more than once
// in a session (handles FCM duplicate deliveries)
const _processedNotificationIds = new Set();

export function isNotificationProcessed(id) {
  if (!id) return false;
  if (_processedNotificationIds.has(id)) return true;
  _processedNotificationIds.add(id);
  // Auto-cleanup after 500 IDs to prevent memory growth in long sessions
  if (_processedNotificationIds.size > 500) {
    const [first] = _processedNotificationIds;
    _processedNotificationIds.delete(first);
  }
  return false;
}

// ─── Register & Get Push Token ───────────────────────────────────────────────
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('[NOTIF] Push notifications require a physical device.');
    return null;
  }

  // Check and request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[NOTIF] Notification permission denied by user.');
    return null;
  }

  // Android Notification Channels
  if (Platform.OS === 'android') {
    // High-priority channel for new orders
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'New Orders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B35',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });

    // Standard channel for KYC and admin updates
    await Notifications.setNotificationChannelAsync('kyc', {
      name: 'KYC & Account Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4CAF50',
      sound: 'default',
      showBadge: true,
    });

    // Channel for admin broadcasts
    await Notifications.setNotificationChannelAsync('admin', {
      name: 'Admin Broadcasts',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  // Get Expo Push Token
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[NOTIF] No EAS projectId found in app config. Push token unavailable.');
      return null;
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[NOTIF] Push token obtained:', pushTokenData.data?.substring(0, 20) + '...');
    return pushTokenData.data;
  } catch (error) {
    console.warn('[NOTIF] Failed to get push token:', error.message);
    return null;
  }
}

// ─── Save Push Token to Backend ───────────────────────────────────────────────
// Saves Expo pushToken (and optionally FCM fcmToken) to our backend.
// Called on login and token refresh.
export async function savePushTokenToBackend(token, apiInstance) {
  if (!token) return;
  try {
    const payload = { pushToken: token };

    // Also try to get the native FCM device token for direct FCM delivery
    try {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        if (deviceToken?.data && typeof deviceToken.data === 'string' && deviceToken.data.length > 20) {
          payload.fcmToken = deviceToken.data;
        }
      }
    } catch (fcmErr) {
      // Non-fatal: Expo push token is sufficient fallback
      console.warn('[NOTIF] Could not get native FCM token (non-fatal):', fcmErr.message);
    }

    await apiInstance.post('/vendor/push-token', payload);
    console.log('[NOTIF] Push token(s) saved to backend. Expo:', !!payload.pushToken, '| FCM:', !!payload.fcmToken);
  } catch (error) {
    // Non-fatal: app works without push token saved; next launch will retry
    console.warn('[NOTIF] Could not save push token to backend:', error.message);
  }
}

// ─── Handle Last Notification on Cold Start ───────────────────────────────────
// Returns the notification that launched the app from KILLED/terminated state.
// Call this once after navigation is ready.
export async function getInitialNotification() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return response ?? null;
  } catch (e) {
    console.warn('[NOTIF] Could not get initial notification:', e.message);
    return null;
  }
}

// ─── Setup All Notification Listeners ────────────────────────────────────────
// Sets up:
//   1. Foreground notification received listener
//   2. User taps notification (foreground or background)
//   3. Token refresh listener (calls onTokenRefresh when FCM rotates token)
//
// Returns a cleanup function to remove all listeners.
export function setupNotificationListeners(
  onNotificationReceived,  // (notification) => void  — app is open
  onNotificationTapped,    // (response) => void       — user taps
  onTokenRefresh           // (newToken) => void        — token rotated
) {
  // 1. Notification received while app is OPEN (foreground)
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const id = notification.request.identifier;
    if (isNotificationProcessed(id)) {
      console.log('[NOTIF] Duplicate skipped (foreground):', id);
      return;
    }
    console.log('[NOTIF] Foreground notification received:', notification.request.content.title);
    if (onNotificationReceived) onNotificationReceived(notification);
  });

  // 2. User taps a notification (works from foreground, background, and killed state)
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = response.notification.request.identifier;
    console.log('[NOTIF] Notification tapped:', id);
    if (onNotificationTapped) onNotificationTapped(response);
  });

  // 3. Token refresh — FCM periodically rotates the push token.
  //    We must update the backend immediately when this happens.
  let tokenSub = null;
  try {
    // Expo SDK 49+ exposes addPushTokenListener
    if (typeof Notifications.addPushTokenListener === 'function') {
      tokenSub = Notifications.addPushTokenListener(({ data: newToken }) => {
        console.log('[NOTIF] Push token refreshed. Saving new token...');
        if (onTokenRefresh) onTokenRefresh(newToken);
      });
    }
  } catch (e) {
    console.warn('[NOTIF] Token refresh listener not available:', e.message);
  }

  // Return cleanup
  return () => {
    receivedSub.remove();
    responseSub.remove();
    if (tokenSub) tokenSub.remove();
  };
}
