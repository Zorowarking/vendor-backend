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
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { notificationService } from '../services/notificationService';
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
  const { isAuthenticated, role, profileStatus, user } = useAuthStore();
  const { activeNotification, setActiveNotification, clearNotification } = useNotificationStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await useAuthStore.getState().initialize();
        
        // Initialize bubble service for Android vendors
        if (Platform.OS === 'android') {
          systemBubbleService.initialize();
        }
      } catch (err) {
        console.error('[LAYOUT] Init Error:', err);
      } finally {
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

  // Notification Initialization
  useEffect(() => {
    if (!isMounted) return;

    let unsubscribe;
    const setupNotifications = async () => {
      unsubscribe = await notificationService.init(router, (remoteMessage) => {
        // Show in-app banner for foreground messages
        setActiveNotification(remoteMessage);
      });

      // Production Hardening: Delay permission request slightly to avoid race conditions 
      // with the splash screen hiding animation, ensuring the system permission dialog is never suppressed.
      setTimeout(async () => {
        try {
          const token = await notificationService.requestPermissionAndToken();
          
          // 2. If already logged in, ensure token is synced (double-check)
          // Pull state dynamically from store to avoid stale closures during the async delay
          const currentAuth = useAuthStore.getState();
          if (currentAuth.isAuthenticated && currentAuth.role === 'VENDOR' && token) {
            await notificationService.syncTokenWithBackend(token);
          }
        } catch (err) {
          console.warn('[NOTIF] Failed in delayed permission flow:', err);
        }
      }, 1500);
    };

    setupNotifications();
    return () => unsubscribe && unsubscribe();
  }, [isMounted]);

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
        Alert.alert(
          "Bubble Hidden",
          "You removed the floating bubble. Would you like to go offline as well to stop receiving new orders?",
          [
            { 
              text: "Stay Online", 
              style: "cancel",
              onPress: () => {
                // Optionally re-show the bubble if there are active orders
                const count = useVendorStore.getState().incomingOrders.length + useVendorStore.getState().activeOrders.length;
                if (count > 0) systemBubbleService.show();
              }
            },
            { 
              text: "Go Offline", 
              onPress: async () => {
                try {
                  await vendorApi.toggleStatus(false, true);
                  useVendorStore.getState().setOnlineStatus('offline');
                } catch (err) {
                  Alert.alert("Error", "Failed to update status. Please try again from the dashboard.");
                }
              }
            }
          ]
        );
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

    // Wrap redirects in a small timeout to let the navigation layer settle safely
    const redirectTimeout = setTimeout(() => {
      if (!isAuthenticated && !inAuthGroup) {
        router.replace('/auth/login');
        return;
      }

      // If unauthenticated but in auth group, only allow login and otp-verify
      if (!isAuthenticated && inAuthGroup && segments[1] !== 'login' && segments[1] !== 'otp-verify') {
        router.replace('/auth/login');
        return;
      }

      if (isAuthenticated && inAuthGroup && role && (profileStatus === 'READY' || profileStatus === 'ACTIVE')) {
        if (role === 'VENDOR') router.replace('/(vendor)');
        return;
      }

      // Global Status Enforcement
      if (profileStatus === 'SUSPENDED') {
        if (segments[0] !== 'account-suspended') {
          router.replace('/account-suspended');
        }
        return;
      }

      if (profileStatus === 'DISABLED') {
        if (segments[0] !== 'account-disabled') {
          router.replace('/account-disabled');
        }
        return;
      }

      // Role-based onboarding checks (only if not already Ready or Enforcement)
      if (isAuthenticated && profileStatus !== 'READY' && profileStatus !== 'ACTIVE') {
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
        }
      }
    }, 150);

    return () => clearTimeout(redirectTimeout);
  }, [isAuthenticated, role, profileStatus, segments, isMounted, navigationState?.key]);

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
          onPress={(msg) => notificationService.handleRouting(router, msg)}
        />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth/login" options={{ title: 'Login' }} />
          <Stack.Screen name="auth/otp-verify" options={{ title: 'Verify OTP' }} />

        </Stack>
      </View>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
