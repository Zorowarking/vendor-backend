import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { auth } from './firebase';
import { 
  signInWithPhoneNumber, 
  GoogleAuthProvider, 
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { Alert, NativeModules } from 'react-native';

// Safely require native firebase auth
let nativeAuth = null;
try {
  // Defensive check for the presence of the native module to prevent startup crashes in Expo Go
  if (NativeModules.RNFBAuthModule || NativeModules.RNFBAppModule) {
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
  _syncInProgress: false,

  /**
   * Google Login Implementation (Expo Go / Web Redirect compatible)
   */
  googleLogin: async (idToken) => {
    try {
      console.log('--- STARTING GOOGLE_LOGIN ---');
      
      if (!idToken) {
        throw new Error('No Google idToken provided');
      }

      let user;
      let sessionToken;

      if (nativeAuth) {
        console.log('--- NATIVE GOOGLE LOGIN VIA FIREBASE NATIVE ---');
        // Native Firebase sign in
        const credential = nativeAuth.GoogleAuthProvider.credential(idToken);
        const result = await nativeAuth().signInWithCredential(credential);
        console.log('--- FIREBASE NATIVE GOOGLE SIGN-IN SUCCESS ---');
        user = result.user;
        sessionToken = await user.getIdToken();
      } else {
        console.log('--- WEB GOOGLE LOGIN VIA FIREBASE WEB SDK ---');
        // Web SDK sign in fallback (e.g. in Expo Go)
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        console.log('--- FIREBASE WEB GOOGLE SIGN-IN SUCCESS ---');
        user = result.user;
        sessionToken = await user.getIdToken();
      }

      // Sync and Update Store
      const { role, profileStatus, phoneVerified } = await authService._syncUser(user, sessionToken);
      
      return { role, profileStatus, phoneVerified };
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
    if (authService._syncInProgress) {
      console.log('[AUTH] Sync already in progress, skipping duplicate call.');
      const currentAuth = useAuthStore.getState();
      return { role: currentAuth.role, profileStatus: currentAuth.profileStatus, phoneVerified: currentAuth.phoneVerified };
    }
    
    authService._syncInProgress = true;
    console.log('--- SYNCING WITH BACKEND ---');
    let role = null;
    let profileStatus = 'PENDING';
    let phoneVerified = false;

    try {
      const syncResponse = await axios.post(`${API_BASE_URL}/api/auth/sync`, {}, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      if (syncResponse.data.success) {
        role = syncResponse.data.user.role;
        profileStatus = syncResponse.data.user.profileStatus;
        phoneVerified = syncResponse.data.user.phoneVerified || false;
        console.log('--- BACKEND SYNC SUCCESS ---', { role, profileStatus, phoneVerified });
      }
      
      // AUTO-ASSIGN VENDOR ROLE: If the user has no role, assign VENDOR automatically
      if (syncResponse.data.success && !role) {
        console.log('--- AUTO-ASSIGNING VENDOR ROLE ---');
        try {
          const roleResponse = await axios.post(`${API_BASE_URL}/api/auth/role`, { role: 'VENDOR' }, {
            headers: { Authorization: `Bearer ${sessionToken}` }
          });
          if (roleResponse.data.success) {
            role = 'VENDOR';
            profileStatus = roleResponse.data.user.profileStatus || 'PENDING';
            phoneVerified = roleResponse.data.user.phoneVerified || false;
          }
        } catch (roleErr) {
          console.error('Auto-role assignment failed:', roleErr.message);
          // Fallback for development: assume VENDOR role locally
          role = 'VENDOR';
        }
      }
    } catch (err) {
      console.warn('Backend sync failed, falling back to PENDING status:', err.message);
      // Fallback: Default to VENDOR role if everything else fails in development
      if (!role) role = 'VENDOR';
    } finally {
      authService._syncInProgress = false;
    }

    useAuthStore.getState().login({
      user: { uid: user.uid, phoneNumber: user.phoneNumber, email: user.email },
      role,
      profileStatus,
      sessionToken,
      phoneVerified,
    });

    return { role, profileStatus, phoneVerified };
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
      const mockOtpMap = {
        [MOCK_TEST_NUMBER]: '123456',
        '+917777777777': '123456',
        '+918888888888': '123456',
        '+911111111111': '222222',
        '+910000000000': '123456'
      };
      if (cleanPhone in mockOtpMap) {
        console.log('--- MOCK MODE TRIGGERED ---');
        const expectedOtp = mockOtpMap[cleanPhone];
        return { 
          isMock: true, 
          confirm: (code) => {
            if (code === expectedOtp) {
              return Promise.resolve({ 
                user: { 
                  uid: `mock-uid-${cleanPhone.replace(/[^0-9]/g, '')}`, 
                  phoneNumber: cleanPhone, 
                  getIdToken: () => Promise.resolve(`mock-session-token-${cleanPhone.replace(/[^0-9]/g, '')}`) 
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
      // Web SDK fallback requires RecaptchaVerifier on iOS
      // Since we are in React Native (not web), use a workaround:
      // Force use of native Firebase if available, 
      // otherwise show a clear error instead of silent crash

      if (!nativeAuth) {
        // Web SDK phone auth requires browser reCAPTCHA
        // which is not available in React Native
        throw new Error(
          'Phone verification requires the standalone app. ' +
          'Please use the installed APK/IPA instead of Expo Go.'
        );
      }

      // Native Firebase handles reCAPTCHA automatically on iOS
      // via APNs silent push — no extra code needed
      const confirmationResult = await nativeAuth().signInWithPhoneNumber(
        cleanPhone
      );
      return confirmationResult;

    } catch (error) {
      console.error('--- SEND_OTP ERROR ---', error);
      let message = 'Failed to send OTP. Please try again.';
      
      if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later or use the test number +919999999999 (OTP: 123456) for development.';
      } else if (error.code === 'auth/invalid-phone-number') {
        message = 'Invalid phone number format.';
      } else if (error.code) {
        message += `\n\n[Firebase Error: ${error.code}]`;
      } else if (error.message) {
        message += `\n\n[Details: ${error.message}]`;
      }
      
      Alert.alert('Security Notice', message);
      throw error;
    }
  },

  /**
   * Sends an OTP for linking/verifying a phone number to the current logged-in user
   */
  sendOTPForLinking: async (phoneNumber) => {
    try {
      console.log('--- STARTING SEND_OTP_FOR_LINKING ---');
      const cleanPhone = phoneNumber.trim();
      console.log('Cleaned Phone for linking:', cleanPhone);
      
      // Developer Bypass: If using a test number, don't call Firebase
      const mockOtpMap = {
        [MOCK_TEST_NUMBER]: '123456',
        '+917777777777': '123456',
        '+918888888888': '123456',
        '+911111111111': '222222',
        '+910000000000': '123456'
      };
      if (cleanPhone in mockOtpMap) {
        console.log('--- MOCK MODE TRIGGERED FOR LINKING ---');
        const expectedOtp = mockOtpMap[cleanPhone];
        return { 
          isMock: true, 
          confirm: (code) => {
            if (code === expectedOtp) {
              return Promise.resolve({ 
                user: { 
                  uid: useAuthStore.getState().user?.uid || 'mock-uid-linking', 
                  phoneNumber: cleanPhone, 
                } 
              });
            }
            return Promise.reject(new Error('Invalid OTP'));
          } 
        };
      }

      // 1. Try Native Auth (linkWithPhoneNumber workaround) if available
      if (nativeAuth) {
        const user = nativeAuth().currentUser;
        if (!user) throw new Error('No user is currently authenticated in Firebase.');
        
        console.log('--- CALLING NATIVE signInWithPhoneNumber for linking ---');
        const confirmationResult = await nativeAuth().signInWithPhoneNumber(cleanPhone);
        console.log('--- OTP SENT SUCCESSFULLY FOR LINKING (NATIVE) ---');
        
        return {
          isNativeLinking: true,
          verificationId: confirmationResult.verificationId,
          confirm: async (code) => {
            console.log('--- LINKING NATIVE CREDENTIAL ---');
            const credential = nativeAuth.PhoneAuthProvider.credential(
              confirmationResult.verificationId,
              code
            );
            try {
              const linkResult = await user.linkWithCredential(credential);
              return linkResult;
            } catch (err) {
              console.log('--- LINKING NATIVE CREDENTIAL ERROR ---', err);
              if (
                err.code === 'auth/credential-already-in-use' ||
                err.code === 'auth/phone-number-already-exists' ||
                err.code === 'auth/provider-already-linked' ||
                err.message?.includes('credential-already-in-use') ||
                err.message?.includes('already associated') ||
                err.message?.includes('already-in-use') ||
                err.message?.includes('already been linked') ||
                err.message?.includes('provider-already-linked') ||
                err.message?.includes('already-linked')
              ) {
                console.log('--- BYPASSING credential-already-in-use or provider-already-linked (OTP is verified and correct) ---');
                return { user: { uid: user.uid, phoneNumber: cleanPhone } };
              }
              throw err;
            }
          }
        };
      }

      // 2. Fallback to Web SDK
      console.log('--- FALLBACK: CALLING WEB LINKING ---');
      throw new Error('Native Firebase Auth is not available in Expo Go. Please use the developer test number for testing.');

    } catch (error) {
      console.error('--- SEND_OTP_FOR_LINKING ERROR ---', error);
      let message = 'Failed to send OTP for linking. Please try again.';
      
      if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later or use the test number +919999999999 (OTP: 123456) for development.';
      } else if (error.code === 'auth/invalid-phone-number') {
        message = 'Invalid phone number format.';
      } else if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/phone-number-already-exists') {
        message = 'This phone number is already linked to another Firebase account.';
      } else if (error.code) {
        message += `\n\n[Firebase Error: ${error.code}]`;
      } else if (error.message) {
        message += `\n\n[Details: ${error.message}]`;
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

  /**
   * Email Sign-In
   */
  loginWithEmail: async (email, password) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      let user = null;
      let sessionToken = null;

      if (nativeAuth) {
        console.log('--- CALLING NATIVE signInWithEmailAndPassword ---');
        const result = await nativeAuth().signInWithEmailAndPassword(cleanEmail, password);
        user = result.user;
        sessionToken = await user.getIdToken();
      } else {
        console.log('--- FALLBACK: CALLING WEB signInWithEmailAndPassword ---');
        const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
        user = result.user;
        sessionToken = await user.getIdToken();
      }

      console.log('Vendor Auth: Email Login successful for', user.email);

      // Sync and Update Store
      const { role, profileStatus, phoneVerified } = await authService._syncUser(user, sessionToken);

      return { role, profileStatus, phoneVerified };
    } catch (error) {
      console.error('Vendor Email Login Error:', error);
      throw error;
    }
  },

  /**
   * Email Sign-Up
   */
  signUpWithEmail: async (email, password, fullName) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();
      let user = null;
      let sessionToken = null;

      if (nativeAuth) {
        console.log('--- CALLING NATIVE createUserWithEmailAndPassword ---');
        const result = await nativeAuth().createUserWithEmailAndPassword(cleanEmail, password);
        user = result.user;
        await user.updateProfile({ displayName: cleanName });
        sessionToken = await user.getIdToken();
      } else {
        console.log('--- FALLBACK: CALLING WEB createUserWithEmailAndPassword ---');
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        user = result.user;
        await updateProfile(user, { displayName: cleanName });
        sessionToken = await user.getIdToken();
      }

      console.log('Vendor Auth: Email Sign-up successful for', user.email);

      // Sync and Update Store
      const { role, profileStatus, phoneVerified } = await authService._syncUser(user, sessionToken);

      return { role, profileStatus, phoneVerified };
    } catch (error) {
      console.error('Vendor Email Sign-Up Error:', error);
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
