import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useAuthStore = create((set) => ({
  user: null,
  role: null, // 'VENDOR' | 'RIDER'
  sessionToken: null,
  isAuthenticated: false,
  profileStatus: null, // 'PENDING' | 'UNDER_REVIEW' | 'READY' | 'SUSPENDED' | 'DISABLED'
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
      await AsyncStorage.removeItem('auth_session');
    } catch (e) {
      console.warn('Failed to remove session', e);
    }
    set({
      user: null,
      role: null,
      sessionToken: null,
      isAuthenticated: false,
      profileStatus: null,
      suspensionReason: null,
      kycDocs: {},
    });
  },

  setProfileStatus: (status, reason = null) => set({ profileStatus: status, suspensionReason: reason }),
  setRole: (role) => set({ role }),
  setKycDoc: (docId, data) => set((state) => ({ kycDocs: { ...state.kycDocs, [docId]: data } })),
}));
