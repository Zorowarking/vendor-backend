import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { notificationService } from '../services/notificationService';
import NotificationBanner from '../components/NotificationBanner';
import NetworkBanner from '../components/NetworkBanner';
import { socketService } from '../services/socketService';
import { useNotificationStore } from '../store/notificationStore';


export default function Layout() {
  const { isAuthenticated, role, profileStatus, user } = useAuthStore();
  const { activeNotification, setActiveNotification, clearNotification } = useNotificationStore();
  const segments = useSegments();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
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
    };

    setupNotifications();
    return () => unsubscribe && unsubscribe();
  }, [isMounted]);

  // Socket Connection Management
  useEffect(() => {
    if (isAuthenticated && role && user?.uid) {
      if (role === 'VENDOR') {
        socketService.connect(user.uid);
      } else if (role === 'RIDER') {
        socketService.connectRider(user.uid);
      }
    } else {
      socketService.disconnect();
    }

    return () => socketService.disconnect();
  }, [isAuthenticated, role, user?.uid]);

  useEffect(() => {
    if (!isMounted) return;

    const inAuthGroup = segments[0] === 'auth';
    const currentScreen = segments[1];

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
      return;
    }

    if (isAuthenticated && inAuthGroup && role && profileStatus === 'READY') {
      if (role === 'VENDOR') router.replace('/(vendor)');
      else if (role === 'RIDER') router.replace('/(rider)');
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

    // Role Selection Enforcement
    if (isAuthenticated && !role && currentScreen !== 'role-select') {
      router.replace('/auth/role-select');
      return;
    }

    // Role-based onboarding checks (only if not already Ready or Enforcement)
    if (isAuthenticated && profileStatus !== 'READY') {

      if (profileStatus === 'PENDING') {
        const onboardingScreens = ['vendor-register', 'vendor-bank', 'rider-register', 'rider-bank', 'kyc'];
        const currentPath = segments.join('/');
        
        if (!onboardingScreens.some(screen => currentPath.includes(screen)) && currentScreen !== 'role-select') {
          if (role === 'VENDOR') router.replace('/auth/vendor-register');
          else if (role === 'RIDER') router.replace('/auth/rider-register');
        }
      } else if (profileStatus === 'UNDER_REVIEW') {
        if (!segments[0].includes('kyc')) {
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
