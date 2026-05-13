import React, { useState, useEffect } from 'react';
import * as KeepAwake from 'expo-keep-awake';

// Safely handle keep-awake to prevent crashes in Expo Go or Web
try {
  KeepAwake.activateKeepAwakeAsync().catch(() => {
    console.log('[DEBUG] Keep awake unavailable, skipping.');
  });
} catch (e) {}
import { View, DeviceEventEmitter, Platform, Alert } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { notificationService } from '../services/notificationService';
import NotificationBanner from '../components/NotificationBanner';
import NetworkBanner from '../components/NetworkBanner';
import { socketService } from '../services/socketService';
import { useNotificationStore } from '../store/notificationStore';
import { systemBubbleService } from '../services/systemBubbleService';
import { useVendorStore } from '../store/vendorStore';
import { vendorApi } from '../services/vendorApi';


export default function Layout() {
  const { isAuthenticated, role, profileStatus, user } = useAuthStore();
  const { activeNotification, setActiveNotification, clearNotification } = useNotificationStore();
  const segments = useSegments();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const init = async () => {
      await useAuthStore.getState().initialize();
      setIsMounted(true);
      systemBubbleService.initialize();
    };
    init();
  }, []);

  // Notification Initialization
  useEffect(() => {
    if (!isMounted) return;

    let unsubscribe;
    const setupNotifications = async () => {
      unsubscribe = await notificationService.init(router, (remoteMessage) => {
        // Show in-app banner for foreground messages
        setActiveNotification(remoteMessage);
      });

      // Request token and sync to backend
      if (isAuthenticated && role === 'VENDOR') {
        await notificationService.requestPermissionAndToken();
      }
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
  useEffect(() => {
    if (role === 'VENDOR') {
      const incoming = useVendorStore.getState().incomingOrders.length;
      const active = useVendorStore.getState().activeOrders.length;
      systemBubbleService.update(incoming + active);
    }
  }, [role, useVendorStore.getState().incomingOrders, useVendorStore.getState().activeOrders]);

  // Bubble Removal Listener -> Offline Dialog
  useEffect(() => {
    if (Platform.OS === 'android' && role === 'VENDOR' && isAuthenticated) {
      const subscription = DeviceEventEmitter.addListener("floating-bubble-remove", (e) => {
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
      return () => subscription.remove();
    }
  }, [role, isAuthenticated]);

  useEffect(() => {
    if (!isMounted) return;

    const inAuthGroup = segments[0] === 'auth';
    const currentScreen = segments[1];

    if (!isAuthenticated && !inAuthGroup) {
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

    // Role Selection Enforcement: If not a vendor, must select role
    if (isAuthenticated && role !== 'VENDOR' && currentScreen !== 'role-select') {
      router.replace('/auth/role-select');
      return;
    }

    // Role-based onboarding checks (only if not already Ready or Enforcement)
    if (isAuthenticated && profileStatus !== 'READY' && profileStatus !== 'ACTIVE') {

      if (profileStatus === 'PENDING') {
        const onboardingScreens = ['vendor-register', 'vendor-bank', 'kyc'];
        const currentPath = segments.join('/');
        if (!onboardingScreens.some(screen => currentPath.includes(screen)) && currentScreen !== 'role-select') {
          if (role === 'VENDOR') router.replace('/auth/vendor-register');
        }
      } else if (profileStatus === 'UNDER_REVIEW') {
        const currentPath = segments.join('/');
        if (!currentPath.includes('kyc')) {
          router.replace('/kyc/status');
        }
      }
    }

  }, [isAuthenticated, role, profileStatus, segments, isMounted]);

  if (!isMounted) return null;

  return (
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
        <Stack.Screen name="auth/role-select" options={{ title: 'Role Selection' }} />
      </Stack>
    </View>
  );
}
