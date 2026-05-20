import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// PRODUCTION HARDENING: Disable all console logs in release builds
if (!__DEV__) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = (msg) => {
    // Optional: send to error tracking service like Sentry
  };
}

import React, { useState, useEffect, useRef } from 'react';
import { View, DeviceEventEmitter, Platform, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';
import { 
  registerForPushNotificationsAsync, 
  savePushTokenToBackend,
  setupNotificationListeners,
  getInitialNotification
} from '../services/notificationService';
import * as Notifications from 'expo-notifications';
import apiClient from '../services/api';
import NotificationBanner from '../components/NotificationBanner';
import NetworkBanner from '../components/NetworkBanner';
import { socketService } from '../services/socketService';
import { useNotificationStore } from '../store/notificationStore';
import { systemBubbleService } from '../services/systemBubbleService';
import { useVendorStore } from '../store/vendorStore';
import { vendorApi } from '../services/vendorApi';
import { ErrorBoundary } from '../components/ErrorBoundary';
import * as SplashScreen from 'expo-splash-screen';

// Prevent auto-hiding to avoid flickering during auth initialization
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Layout() {
  const { isAuthenticated, role, profileStatus, phoneVerified, user } = useAuthStore();
  const { activeNotification, setActiveNotification, clearNotification } = useNotificationStore();
  const segments = useSegments();
  const notificationListener = useRef();
  const responseListener = useRef();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [isMounted, setIsMounted] = useState(false);
  const [navTick, setNavTick] = useState(0);

  const checkBubbleClosedExternally = async () => {
    try {
      const flag = await AsyncStorage.getItem('@was_bubble_closed_externally');
      if (flag === 'true') {
        await AsyncStorage.removeItem('@was_bubble_closed_externally');
        
        Alert.alert(
          "Bubble Hidden",
          "You removed the floating bubble. Would you like to go offline as well to stop receiving new orders?",
          [
            { 
              text: "STAY ONLINE", 
              style: "default",
              onPress: () => {
                // Re-show the bubble if active orders exist
                const count = useVendorStore.getState().incomingOrders.length + useVendorStore.getState().activeOrders.length;
                if (count > 0) {
                  systemBubbleService.show();
                }
              }
            },
            { 
              text: "GO OFFLINE", 
              style: "destructive",
              onPress: async () => {
                try {
                  await vendorApi.toggleStatus(false, true);
                  useVendorStore.getState().setOnlineStatus('offline');
                } catch (err) {
                  Alert.alert("Error", "Failed to update status. Please try again from the dashboard.");
                }
              }
            }
          ],
          { cancelable: false }
        );
      }
    } catch (e) {
      console.error('[BUBBLE] Error checking external close flag:', e);
    }
  };

  // On mount or when authenticated as VENDOR, check if bubble was closed externally
  useEffect(() => {
    if (isAuthenticated && role === 'VENDOR') {
      checkBubbleClosedExternally();
    }
  }, [isAuthenticated, role]);

  // Dynamic Navigation Polling (solves buggy Expo Router navigationState mounting)
  useEffect(() => {
    if (isMounted && navigationState?.key) return;
    
    const interval = setInterval(() => {
      setNavTick((t) => t + 1);
    }, 50);

    return () => clearInterval(interval);
  }, [isMounted, navigationState?.key]);

  useEffect(() => {
    const init = async () => {
      try {
        const authStore = useAuthStore.getState();
        await authStore.initialize();
        
        // INSTANT INITIALIZATION: Mount immediately after session is restored to avoid blocking on API requests
        setIsMounted(true);
        
        // Fetch fresh profile status in background to prevent slow startup
        if (authStore.isAuthenticated && authStore.role === 'VENDOR') {
          vendorApi.getProfile()
            .then((profile) => {
              if (profile && profile.profileStatus) {
                authStore.setProfileStatus(profile.profileStatus);
              }
            })
            .catch((e) => {
              console.warn('[LAYOUT] Background profile status check failed:', e.message);
            });
        }
        
        // Initialize bubble service for Android vendors
        if (Platform.OS === 'android') {
          systemBubbleService.initialize();
        }
      } catch (err) {
        console.error('[LAYOUT] Init Error:', err);
        setIsMounted(true);
      }
    };
    init();

    // Fallback: Ensure splash screen hides after 5 seconds no matter what
    const timeout = setTimeout(() => {
      setIsMounted(true);
      SplashScreen.hideAsync().catch(() => {});
    }, 5000);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  // Dynamic Firebase Auth State Listener to sync store on Google/OTP Login and Logout
  useEffect(() => {
    const { onAuthStateChanged } = require('firebase/auth');
    const { auth } = require('../services/firebase');

    // 1. Web Auth Listener
    const unsubscribeWeb = onAuthStateChanged(auth, async (firebaseUser) => {
      const authStore = useAuthStore.getState();
      if (firebaseUser) {
        if (!authStore.isAuthenticated && !authService._syncInProgress) {
          console.log('[LAYOUT] Web onAuthStateChanged: User detected, syncing session...');
          try {
            const token = await firebaseUser.getIdToken();
            await authService._syncUser(firebaseUser, token);
            // After sync, ensure push token is registered on the backend
            registerForPushNotificationsAsync().then(pushTok => {
              if (pushTok) savePushTokenToBackend(pushTok, apiClient);
            });
          } catch (e) {
            console.error('[LAYOUT] Web onAuthStateChanged sync error:', e);
          }
        }
      } else {
        console.log('[LAYOUT] Web onAuthStateChanged: No user session detected (safe).');
      }
    });

    // 2. Native Auth Listener (if available)
    let unsubscribeNative = null;
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.RNFBAuthModule || NativeModules.RNFBAppModule) {
        const nativeAuth = require('@react-native-firebase/auth').default;
        unsubscribeNative = nativeAuth().onAuthStateChanged(async (firebaseUser) => {
          const authStore = useAuthStore.getState();
          if (firebaseUser) {
            if (!authStore.isAuthenticated && !authService._syncInProgress) {
              console.log('[LAYOUT] Native onAuthStateChanged: User detected, syncing session...');
              try {
                const token = await firebaseUser.getIdToken();
                await authService._syncUser(firebaseUser, token);
              } catch (e) {
                console.error('[LAYOUT] Native onAuthStateChanged sync error:', e);
              }
            }
          } else {
            console.log('[LAYOUT] Native onAuthStateChanged: No user session detected (safe).');
          }
        });
      }
    } catch (nativeErr) {
      console.warn('[LAYOUT] Native Auth Listener failed to setup:', nativeErr.message);
    }

    return () => {
      if (unsubscribeWeb) unsubscribeWeb();
      if (unsubscribeNative) unsubscribeNative();
    };
  }, []);

  // Track AppState for background/foreground badge notifications
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (role === 'VENDOR') {
        const vendorStore = useVendorStore.getState();
        vendorStore.setAppState(nextAppState);
        
        // If returning to foreground, clear the unread activity badge 
        // (we assume they're looking at the app now)
        if (nextAppState === 'active') {
          vendorStore.setHasUnreadActivity(false);
          systemBubbleService.hide();
          if (isAuthenticated) {
            checkBubbleClosedExternally();
          }
        } else if (nextAppState === 'background' || nextAppState === 'inactive') {
          // Show floating bubble when app is backgrounded
          systemBubbleService.show();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [role]);

  // Background vendor status sync
  useEffect(() => {
    if (!isAuthenticated || role !== 'VENDOR') return;

    const checkVendorStatus = async () => {
      try {
        const profile = await vendorApi.getProfile();
        if (profile && profile.profileStatus) {
          const currentStatus = useAuthStore.getState().profileStatus;
          if (currentStatus !== profile.profileStatus) {
            console.log(`[VENDOR-LAYOUT] Profile status updated from ${currentStatus} to ${profile.profileStatus}`);
            useAuthStore.getState().setProfileStatus(profile.profileStatus);
          }
        }
      } catch (e) {
        console.warn('[VENDOR-LAYOUT] Background status check failed:', e.message);
      }
    };

    const interval = setInterval(checkVendorStatus, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, role]);

  // Notification Initialization
  useEffect(() => {
    if (!isMounted) return;

    // 1. Register for push and save token to backend
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        const { isAuthenticated: currentAuth } = useAuthStore.getState();
        if (currentAuth) {
          savePushTokenToBackend(token, apiClient);
        }
      }
    });

    // Helper: navigate based on notification type
    const handleNavigationFromNotif = (data) => {
      const type = (data?.type || data?.notifType || '').toUpperCase();
      if (type === 'NEW_ORDER') {
        router.push('/(vendor)');
      } else if (
        type === 'KYC_APPROVED' ||
        type === 'KYC_REJECTED' ||
        type === 'KYC_STATUS_UPDATED'
      ) {
        router.push('/kyc/status');
      } else if (type === 'ADMIN_BROADCAST') {
        // Navigate to profile/notifications tab for broadcast messages
        router.push('/(vendor)/profile');
      }
    };

    // 2. Handle tap on notification that LAUNCHED the app from KILLED state
    getInitialNotification().then(response => {
      if (response) {
        const data = response.notification.request.content.data;
        console.log('[NOTIF] App launched from killed state via notification:', data?.type);
        handleNavigationFromNotif(data);
      }
    });

    // 3. Setup foreground + background + token refresh listeners
    const cleanup = setupNotificationListeners(
      // Foreground: notification received while app is OPEN
      (notification) => {
        console.log('[NOTIF] Foreground notification:', notification.request.content.title);
        setActiveNotification(notification);

        // If it's a new order, update unread badge even if they're on another tab
        const data = notification.request.content.data;
        const type = (data?.type || '').toUpperCase();
        if (type === 'NEW_ORDER') {
          useVendorStore.getState().setHasUnreadActivity(true);
        }
      },
      // Background/Foreground tap: user taps a notification
      (response) => {
        const data = response.notification.request.content.data;
        console.log('[NOTIF] Notification tapped (bg/fg):', data?.type);
        handleNavigationFromNotif(data);
      },
      // Token refresh: FCM rotated the push token — update backend immediately
      (newToken) => {
        console.log('[NOTIF] Token refreshed. Saving to backend...');
        const { isAuthenticated: currentAuth } = useAuthStore.getState();
        if (currentAuth && newToken) {
          savePushTokenToBackend(newToken, apiClient);
        }
      }
    );

    return cleanup;
  }, [isAuthenticated, isMounted]);

  // Socket Connection Management
  useEffect(() => {
    if (isAuthenticated && role === 'VENDOR' && user?.uid) {
      socketService.connect(user.uid);
    } else {
      socketService.disconnect();
    }

    return () => socketService.disconnect();
  }, [isAuthenticated, role, user?.uid]);

  // System-level Bubble Update
  const incomingOrders = useVendorStore((state) => state.incomingOrders || []);
  const activeOrders = useVendorStore((state) => state.activeOrders || []);

  useEffect(() => {
    if (role === 'VENDOR') {
      const incoming = incomingOrders.length;
      const active = activeOrders.length;
      systemBubbleService.update(incoming + active);
    }
  }, [role, incomingOrders, activeOrders]);


  // Bubble Listeners (Press to reopen app, Remove to toggle offline)
  useEffect(() => {
    if (Platform.OS === 'android' && role === 'VENDOR' && isAuthenticated) {
      const pressSub = DeviceEventEmitter.addListener("floating-bubble-press", (e) => {
        console.log('[BUBBLE] Bubble pressed, reopening app...');
        systemBubbleService.reopen();
      });

      const removeSub = DeviceEventEmitter.addListener("floating-bubble-remove", (e) => {
        // 1. Check if the bubble was closed programmatically (e.g. from transition or active state)
        if (systemBubbleService.isProgrammaticHide) {
          console.log('[BUBBLE] Bubble hidden programmatically. Resetting flag and skipping offline dialog.');
          systemBubbleService.isProgrammaticHide = false;
          return;
        }

        if (AppState.currentState === 'active') {
          console.log('[BUBBLE] Bubble hidden programmatically in active state. Skipping offline dialog.');
          return;
        }

        // 2. Closed externally (user dragged to remove zone). Since we are in the background,
        // instantly set the storage flag and call reopen() to bring the app to the foreground.
        console.log('[BUBBLE] Bubble closed externally. Saving flag and reopening app...');
        AsyncStorage.setItem('@was_bubble_closed_externally', 'true')
          .then(() => {
            systemBubbleService.reopen();
          })
          .catch((err) => {
            console.error('[BUBBLE] Failed to save external close flag:', err);
          });
      });

      return () => {
        pressSub.remove();
        removeSub.remove();
      };
    }
  }, [role, isAuthenticated]);

  useEffect(() => {
    // CRITICAL: Must wait for both initialization and the root navigator to be mounted
    if (!isMounted || !navigationState?.key) return;

    // Hide splash screen as soon as we're mounted and auth is checked
    SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup = segments[0] === 'auth';
    const currentScreen = segments[1];

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
      return;
    }

    // If unauthenticated but in auth group, only allow login and otp-verify
    if (!isAuthenticated && inAuthGroup && segments[1] !== 'login' && segments[1] !== 'otp-verify' && segments[1] !== 'verify-phone') {
      router.replace('/auth/login');
      return;
    }

    const isReadyOrActive = (profileStatus === 'READY' || profileStatus === 'ACTIVE' || profileStatus === 'APPROVED') && phoneVerified === true;
    if (isAuthenticated && inAuthGroup && role && isReadyOrActive) {
      if (role === 'VENDOR') router.replace('/(vendor)');
      return;
    }

    // Global Status Enforcement
    const isSuspended = profileStatus === 'SUSPENDED';
    const isDisabledTemp = profileStatus && profileStatus.startsWith('DISABLED:');

    if (isSuspended) {
      // Suspended maps to permanent termination screen
      if (segments[0] !== 'account-disabled') {
        router.replace('/account-disabled');
      }
      return;
    }

    if (isDisabledTemp) {
      // Temporarily disabled maps to account-suspended screen with ticking countdown timer
      if (segments[0] !== 'account-suspended') {
        router.replace('/account-suspended');
      }
      return;
    }

    // Role-based onboarding checks (only if not already Ready or Enforcement)
    if (isAuthenticated && !isReadyOrActive && !isSuspended && !isDisabledTemp) {
      if (profileStatus === 'PENDING') {
        const onboardingScreens = ['vendor-register', 'vendor-bank', 'kyc'];
        const currentPath = segments.join('/');
        if (!onboardingScreens.some(screen => currentPath.includes(screen))) {
          if (role === 'VENDOR') router.replace('/auth/vendor-register');
        }
      } else if (profileStatus === 'UNDER_REVIEW') {
        const currentPath = segments.join('/');
        if (!currentPath.includes('kyc')) {
          router.replace('/kyc/status');
        }
      } else if ((profileStatus === 'APPROVED' || profileStatus === 'ACTIVE' || profileStatus === 'READY') && !phoneVerified) {
        const currentPath = segments.join('/');
        if (!currentPath.includes('verify-phone')) {
          router.replace('/auth/verify-phone');
        }
        return;
      }
    }
  }, [isAuthenticated, role, profileStatus, phoneVerified, segments, isMounted, navigationState?.key, navTick]);

  if (!isMounted) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <NetworkBanner />
        <NotificationBanner 
          notification={activeNotification}
          onDismiss={clearNotification}
          onPress={(msg) => {
            const data = msg?.request?.content?.data || msg?.data;
            const type = (data?.type || data?.notifType || '').toUpperCase();
            if (type === 'NEW_ORDER') {
              router.push('/(vendor)');
            } else if (
              type === 'KYC_APPROVED' ||
              type === 'KYC_REJECTED' ||
              type === 'KYC_STATUS_UPDATED'
            ) {
              router.push('/kyc/status');
            } else if (type === 'ADMIN_BROADCAST') {
              router.push('/(vendor)/profile');
            }
          }}
        />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth/login" options={{ title: 'Login' }} />
          <Stack.Screen name="auth/otp-verify" options={{ title: 'Verify OTP' }} />
          <Stack.Screen name="auth/verify-phone" options={{ title: 'Verify Phone' }} />
        </Stack>
      </View>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
