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
    }
    return null;
  },

  logout: async () => {
    try {
      // 1. Sign out from Firebase Auth
      await auth.signOut();
      console.log('[STORE] Firebase Auth Sign-Out Success');
    } catch (firebaseErr) {
      console.warn('[STORE] Firebase Auth Sign-Out failed:', firebaseErr.message);
    }

    try {
      // 2. Clear native Google Sign-In session if module is available
      const GoogleModule = require('@react-native-google-signin/google-signin');
      const GoogleSignin = GoogleModule.GoogleSignin;
      if (await GoogleSignin.isSignedIn()) {
        await GoogleSignin.signOut();
        console.log('[STORE] Google Sign-In Session Cleared');
      }
    } catch (googleErr) {
      console.log('[STORE] Native Google Sign-Out not available or skipped:', googleErr.message);
    }

    try {
      // 3. Clear Async Storage
      await AsyncStorage.removeItem('auth_session');
    } catch (e) {
      console.warn('[STORE] Failed to remove session from AsyncStorage', e);
    }

    // 4. Reset state
    set({
      user: null,
      role: null,
      sessionToken: null,
      isAuthenticated: false,
      profileStatus: null,
      phoneVerified: false,
      suspensionReason: null,
      kycDocs: {},
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
