import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { auth } from './firebase';
import { 
  signInWithPhoneNumber, 
  GoogleAuthProvider, 
  signInWithCredential 
} from 'firebase/auth';
import { Alert, NativeModules } from 'react-native';

// Safely require native firebase auth
let nativeAuth = null;
try {
  if (NativeModules.RNFBAppModule) {
    nativeAuth = require('@react-native-firebase/auth').default;
  }
} catch (e) {
  console.log('[AUTH] Native Firebase Auth not available, using Web SDK fallback.');
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.0.107:3001';

const MOCK_TEST_NUMBER = '+919999999999';
const MOCK_OTP = '123456';

export const authService = {
  _confirmationResult: null,

  /**
   * Google Login Implementation (Expo Go / Web Redirect compatible)
   */
  googleLogin: async (idToken) => {
    try {
      console.log('--- STARTING GOOGLE_LOGIN ---');
      
      if (!idToken) {
        throw new Error('No Google idToken provided');
      }

      // Create a Firebase credential with the token
      const credential = GoogleAuthProvider.credential(idToken);
      
      // Sign in to Firebase with the credential
      const result = await signInWithCredential(auth, credential);
      console.log('--- FIREBASE GOOGLE SIGN-IN SUCCESS ---');
      
      const user = result.user;
      const sessionToken = await user.getIdToken();

      // Sync and Update Store
      const { role, profileStatus } = await authService._syncUser(user, sessionToken);
      
      return { role, profileStatus };
    } catch (error) {
      console.error('--- GOOGLE_LOGIN ERROR ---', error);
      Alert.alert('Login Error', 'Unable to sign in with Google. Please try again or use Phone login.');
      throw error;
    }
  },

  /**
   * Internal helper to sync user data with the backend
   */
  _syncUser: async (user, sessionToken) => {
    console.log('--- SYNCING WITH BACKEND ---');
    let role = null;
    let profileStatus = 'PENDING';

    try {
      const syncResponse = await axios.post(`${API_BASE_URL}/api/auth/sync`, {}, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      if (syncResponse.data.success) {
        role = syncResponse.data.user.role;
        profileStatus = syncResponse.data.user.profileStatus;
        console.log('--- BACKEND SYNC SUCCESS ---', { role, profileStatus });
      }
    } catch (err) {
      console.warn('Backend sync failed, falling back to PENDING status:', err.message);
    }

    useAuthStore.getState().login({
      user: { uid: user.uid, phoneNumber: user.phoneNumber, email: user.email },
      role,
      profileStatus,
      sessionToken,
    });

    return { role, profileStatus };
  },

  /**
   * Sends an OTP via Firebase Web SDK with Developer Mock Bypass
   */
  sendOTP: async (phoneNumber) => {
    try {
      console.log('--- STARTING SEND_OTP ---');
      const cleanPhone = phoneNumber.trim();
      console.log('Cleaned Phone:', cleanPhone);
      
      // Developer Bypass: If using a test number, don't call Firebase
      if (cleanPhone === MOCK_TEST_NUMBER || cleanPhone === '+917777777777') {
        console.log('--- DEV MOCK MODE TRIGGERED ---');
        return { 
          isMock: true, 
          confirm: (code) => {
            if (code === MOCK_OTP) {
              return Promise.resolve({ 
                user: { 
                  uid: 'mock-uid-123', 
                  phoneNumber: cleanPhone, 
                  getIdToken: () => Promise.resolve('mock-session-token-123') 
                } 
              });
            }
            return Promise.reject(new Error('Invalid OTP'));
          } 
        };
      }

      // 1. Try Native Auth (Invisible Recaptcha) if available
      if (nativeAuth) {
        console.log('--- CALLING NATIVE signInWithPhoneNumber ---');
        const confirmationResult = await nativeAuth().signInWithPhoneNumber(cleanPhone);
        console.log('--- OTP SENT SUCCESSFULLY (NATIVE) ---');
        return confirmationResult;
      }

      // 2. Fallback to Web SDK
      console.log('--- FALLBACK: CALLING WEB signInWithPhoneNumber ---');
      // This will succeed if the number is a test number in Firebase
      return await signInWithPhoneNumber(auth, phoneNumber);

    } catch (error) {
      console.error('--- SEND_OTP ERROR ---', error);
      let message = 'Failed to send OTP. Please try again.';
      
      if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later or use the test number +919999999999 (OTP: 123456) for development.';
      } else if (error.code === 'auth/invalid-phone-number') {
        message = 'Invalid phone number format.';
      }
      
      Alert.alert('Security Notice', message);
      throw error;
    }
  },

  /**
   * Verifies an OTP code using the confirmationResult
   */
  verifyOTP: async (confirmationResult, code) => {
    try {
      console.log('--- STARTING VERIFY_OTP ---');
      
      if (!confirmationResult || !confirmationResult.confirm) {
        throw new Error('No confirmation result object found. Please try sending OTP again.');
      }
      
      const result = await confirmationResult.confirm(code);
      console.log('--- OTP VERIFIED SUCCESSFULLY ---');
      const user = result.user;
      const sessionToken = await user.getIdToken();

      return await authService._syncUser(user, sessionToken);

    } catch (error) {
      console.error('--- VERIFY_OTP ERROR ---', error);
      Alert.alert('Error', 'Invalid OTP code. Please check and try again.');
      throw error;
    }
  },

  logout: async () => {
    try {
      await auth.signOut();
      await useAuthStore.getState().logout();
    } catch (error) {
      console.error('Logout Error:', error);
      throw error;
    }
  },
};
