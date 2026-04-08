import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { auth } from './firebase';
import { 
  signInWithPhoneNumber, 
  GoogleAuthProvider, 
  signInWithCredential 
} from 'firebase/auth';
import { Alert } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

const MOCK_TEST_NUMBER = '+919999999999';
const MOCK_OTP = '123456';

export const authService = {
  _confirmationResult: null,

  /**
   * Google Login Implementation (Web/Expo Go version)
   */
  googleLogin: async () => {
    try {
      // In Expo Go, Google Login with the JS SDK usually requires AuthSession
      Alert.alert('Info', 'Google Login in Expo Go requires additional configuration. Use OTP for now.');
      return null;
    } catch (error) {
      console.error('Google Login Error:', error);
      Alert.alert('Error', 'Google login failed');
      throw error;
    }
  },

  /**
   * Sends an OTP via Firebase Web SDK with Developer Mock Bypass
   */
  sendOTP: async (phoneNumber, recaptchaVerifier) => {
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

      if (!recaptchaVerifier) {
        throw new Error('Recaptcha verifier is required for Web SDK Phone Auth');
      }

      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      console.log('--- OTP SENT SUCCESSFULLY ---');
      return confirmationResult;
    } catch (error) {
      console.error('--- SEND_OTP ERROR ---', error);
      let message = 'Failed to send OTP. Please try again.';
      
      if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later or use the test number +919999999999 (OTP: 123456) for development.';
      } else if (error.code === 'auth/captcha-check-failed') {
        message = 'Recaptcha verification failed. Please try again.';
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
        user: { uid: user.uid, phoneNumber: user.phoneNumber },
        role,
        profileStatus,
        sessionToken,
      });

      return { role, profileStatus };

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
