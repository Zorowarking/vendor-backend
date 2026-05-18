import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';

export const useAuthStore = create((set) => ({
  user: null,
  role: null, // 'VENDOR' | 'RIDER'
  sessionToken: null,
  isAuthenticated: false,
  profileStatus: null, // 'PENDING' | 'UNDER_REVIEW' | 'READY' | 'SUSPENDED' | 'DISABLED'
  phoneVerified: false,
  suspensionReason: null,
  kycDocs: {},
  vendorRegistrationData: null, // Holds data between Vendor Details and Bank Details screens
  isHydrated: false,

  setVendorRegistrationData: (data) => set({ vendorRegistrationData: data }),

  login: (userData) => {
    set({
      user: userData.user,
      role: userData.role,
      sessionToken: userData.sessionToken,
      isAuthenticated: true,
      profileStatus: userData.profileStatus,
      phoneVerified: userData.phoneVerified || false,
      suspensionReason: userData.suspensionReason || null,
      kycDocs: {},
      isHydrated: true,
    });
    // Persist session
    try {
      AsyncStorage.setItem('auth_session', JSON.stringify(userData));
    } catch (e) {
      console.warn('Failed to persist session', e);
    }
  },

  initialize: async () => {
    try {
      const session = await AsyncStorage.getItem('auth_session');
      if (session) {
        const userData = JSON.parse(session);
        set({
          user: userData?.user ?? null,
          role: userData?.role ?? null,
          sessionToken: userData?.sessionToken ?? null,
          isAuthenticated: !!userData?.sessionToken,
          profileStatus: userData?.profileStatus ?? null,
          phoneVerified: userData?.phoneVerified ?? false,
          suspensionReason: userData?.suspensionReason || null,
          isHydrated: true,
        });
        return userData;
      }
    } catch (e) {
      console.warn('Failed to restore session', e);
      try {
        await AsyncStorage.removeItem('auth_session');
      } catch (rmErr) {
        console.warn('Failed to clear corrupt session:', rmErr.message);
      }
    } finally {
      set({ isHydrated: true });
    }
    return null;
  },

  logout: async () => {
    // 1. Sign out from Firebase Auth (Web & Native)
    try {
      await auth.signOut();
      console.log('[STORE] Firebase Auth Web Sign-Out Success');
    } catch (firebaseErr) {
      console.warn('[STORE] Firebase Auth Web Sign-Out failed:', firebaseErr.message);
    }

    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.RNFBAuthModule || NativeModules.RNFBAppModule) {
        const nativeAuth = require('@react-native-firebase/auth').default;
        await nativeAuth().signOut();
        console.log('[STORE] Firebase Auth Native Sign-Out Success');
      }
    } catch (nativeFbErr) {
      console.warn('[STORE] Firebase Auth Native Sign-Out failed:', nativeFbErr.message);
    }

    // 2. Clear native Google Sign-In session (configure + signOut + revokeAccess)
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.RNGoogleSignin) {
        const GoogleModule = require('@react-native-google-signin/google-signin');
        const GoogleSignin = GoogleModule.GoogleSignin;
        
        // Dynamically configure it to be absolutely safe
        try {
          await GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            offlineAccess: false,
          });
        } catch (configErr) {
          console.log('[STORE] Google Sign-In already configured or config failed:', configErr.message);
        }

        try {
          await GoogleSignin.signOut();
          console.log('[STORE] Google Sign-Out Success');
        } catch (signOutErr) {
          console.log('[STORE] Google Sign-Out error:', signOutErr.message);
        }

        try {
          await GoogleSignin.revokeAccess();
          console.log('[STORE] Google Revoke Access Success');
        } catch (revokeErr) {
          console.log('[STORE] Google Revoke Access error (safe to ignore if not signed in):', revokeErr.message);
        }
      }
    } catch (googleErr) {
      console.log('[STORE] Native Google Sign-Out not available or skipped:', googleErr.message);
    }

    // 3. Clear Async Storage
    try {
      await AsyncStorage.removeItem('auth_session');
      console.log('[STORE] Session cleared from AsyncStorage');
    } catch (e) {
      console.warn('[STORE] Failed to remove session from AsyncStorage', e);
    }

    // 4. Clear vendor and notification stores dynamically to prevent stale lifecycle deadlock
    try {
      const { useVendorStore } = require('./vendorStore');
      useVendorStore.getState().clearStore();
      console.log('[STORE] Vendor Store State Cleared');
    } catch (vendorErr) {
      console.warn('[STORE] Failed to clear vendor store:', vendorErr.message);
    }

    try {
      const { useNotificationStore } = require('./notificationStore');
      useNotificationStore.getState().clearNotification();
      console.log('[STORE] Notification Store State Cleared');
    } catch (notifErr) {
      console.warn('[STORE] Failed to clear notification store:', notifErr.message);
    }

    // 5. Reset state
    set({
      user: null,
      role: null,
      sessionToken: null,
      isAuthenticated: false,
      profileStatus: null,
      phoneVerified: false,
      suspensionReason: null,
      kycDocs: {},
      isHydrated: true,
    });
  },

  setProfileStatus: (status, reason = null) => {
    set({ profileStatus: status, suspensionReason: reason });
    try {
      AsyncStorage.getItem('auth_session').then((session) => {
        if (session) {
          const userData = JSON.parse(session);
          userData.profileStatus = status;
          userData.suspensionReason = reason || null;
          AsyncStorage.setItem('auth_session', JSON.stringify(userData));
        }
      });
    } catch (e) {
      console.warn('Failed to persist profile status change:', e);
    }
  },

  verifyPhoneSuccess: () => {
    set({ phoneVerified: true });
    try {
      AsyncStorage.getItem('auth_session').then((session) => {
        if (session) {
          const userData = JSON.parse(session);
          userData.phoneVerified = true;
          AsyncStorage.setItem('auth_session', JSON.stringify(userData));
        }
      });
    } catch (e) {
      console.warn('Failed to persist phone verification success:', e);
    }
  },

  setRole: (role) => set({ role }),
  setKycDoc: (docId, data) => set((state) => ({ kycDocs: { ...state.kycDocs, [docId]: data } })),
}));
