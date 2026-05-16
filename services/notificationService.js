import { Platform, NativeModules, PermissionsAndroid, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vendorApi } from './vendorApi';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';

// Dynamic import for FCM (Safe for Expo Go)
let messaging = null;
try {
  // Only attempt require if the native module is actually linked (prevents crash in Expo Go)
  if (NativeModules.RNFBMessagingModule) {
    messaging = require('@react-native-firebase/messaging').default;
  }
} catch (e) {
  console.warn('[NOTIF] FCM native library not found. Falling back to Mock Notification mode.');
}

const FCM_TOKEN_KEY = 'fcm_token_v1';

export const notificationService = {
  /**
   * Initialize Global Notification Listeners
   * @param {Object} navigation - App navigation/router
   * @param {Function} onForegroundMessage - Callback for in-app banner
   */
  init: async (router, onForegroundMessage) => {
    if (!messaging) return;

    // Handle Background/Quit state notifications
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('Notification caused app to open from background:', remoteMessage);
      notificationService.handleRouting(router, remoteMessage);
    });

    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage) {
        console.log('Notification caused app to open from quit state:', remoteMessage);
        notificationService.handleRouting(router, remoteMessage);
      }
    });

    // Handle Foreground notifications
    const unsubscribeMessage = messaging().onMessage(async remoteMessage => {
      console.log('Foreground message received:', remoteMessage);
      useNotificationStore.getState().setActiveNotification(remoteMessage);
      if (onForegroundMessage) {
        onForegroundMessage(remoteMessage);
      }
    });

    // Handle Token Refresh
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(token => {
      console.log('FCM Token refreshed:', token);
      notificationService.syncTokenWithBackend(token);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeTokenRefresh();
    };
  },

  /**
   * Request Permission and Sync Token to Backend
   */
  requestPermissionAndToken: async () => {
    // 1. Android 13+ Runtime Permission Request (Critical for receiving orders)
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Receive New Orders',
            message: 'Vantyrn Vendor needs permission to notify you about new incoming orders and status updates.',
            buttonNeutral: 'Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'Allow',
          }
        );
        
        if (granted === PermissionsAndroid.RESULTS.DENIED) {
          console.warn('[NOTIF] POST_NOTIFICATIONS permission denied.');
          return null;
        }

        if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Alert.alert(
            'Action Required',
            'Notifications are disabled. You must enable them in settings to receive and accept new orders.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
          return null;
        }
      } catch (err) {
        console.warn('[NOTIF] Permission request error:', err);
      }
    }

    if (!messaging) {
      console.log('[MOCK FCM] Permission Requested. Using Mock Token.');
      return 'mock_fcm_token_' + Date.now();
    }

    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('[NOTIF] Permission granted. Fetching token...');
        const token = await messaging().getToken();
        await notificationService.syncTokenWithBackend(token);
        return token;
      } else {
        console.warn('[NOTIF] Permission denied or not determined.');
      }
    } catch (error) {
      console.error('[NOTIF] Failed to get FCM permission/token:', error);
    }
  },

  /**
   * Send token to Vendor or Rider API
   */
  syncTokenWithBackend: async (token) => {
    const { role, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated || !role) return;

    try {
      // Save locally to avoid redundant updates if token hasn't changed
      const oldToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
      if (oldToken === token) return;

      if (role === 'VENDOR') {
        await vendorApi.updateProfile({ fcmToken: token });
      }
      
      await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
      console.log(`FCM Token synced for ${role}:`, token);
    } catch (error) {
      console.error('Sync FCM token failed:', error);
    }
  },

  /**
   * Universal Routing Logic for Notifications
   */
  handleRouting: (router, remoteMessage) => {
    const { type, orderId } = remoteMessage.data || {};
    const { role } = useAuthStore.getState();

    console.log(`Routing for notification type: ${type}`);

    switch (type) {
      case 'new_order':
        if (role === 'VENDOR') router.replace('/(vendor)');
        break;
      case 'order_flagged':
        if (role === 'VENDOR' && orderId) router.replace(`/(vendor)/orders/${orderId}`);
        else if (role === 'VENDOR') router.replace('/(vendor)');
        break;
      case 'kyc_approved':
        router.replace('/(vendor)');
        break;
      case 'kyc_rejected':
        router.replace('/kyc/status');
        break;
      default:
        console.warn('Unknown notification type, no routing performed.');
    }

  },

  /**
   * DEV ONLY: Simulate an incoming notification
   */
  triggerMockNotification: (type, title, body, onMessage) => {
    const mockPayload = {
      notification: { title, body },
      data: { type, orderId: 'MOCK_123' }
    };
    if (onMessage) onMessage(mockPayload);
  }
};
