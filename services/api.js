import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const getApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  // Fallback for local development if env is missing
  return 'https://vendor-backend-production-c171.up.railway.app';
};

const API_BASE_URL = getApiBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

import { auth as webAuth, authInitialized } from './firebase';
import { NativeModules } from 'react-native';

// Safely require native firebase auth
let nativeAuth = null;
try {
  if (NativeModules.RNFBAuthModule || NativeModules.RNFBAppModule) {
    nativeAuth = require('@react-native-firebase/auth').default;
  }
} catch (e) {}

const getFreshToken = async () => {
  try {
    // Wait for Firebase Auth to finish its initial restore of session
    if (authInitialized) {
      await authInitialized;
    }

    // 1. Try Native Auth current user
    if (nativeAuth) {
      const user = nativeAuth().currentUser;
      if (user) {
        const freshToken = await user.getIdToken();
        if (freshToken) return freshToken;
      }
    }
    // 2. Try Web Auth current user
    if (webAuth && webAuth.currentUser) {
      const freshToken = await webAuth.currentUser.getIdToken();
      if (freshToken) return freshToken;
    }
  } catch (e) {
    console.warn('[VENDOR-API] Failed to get fresh Firebase ID token dynamically:', e.message);
  }
  // 3. Fallback to Zustand static token
  return useAuthStore.getState().sessionToken;
};

// Request Interceptor: Attach Auth Token
apiClient.interceptors.request.use(
  async (config) => {
    const { sessionToken, isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated || sessionToken) {
      const dynamicToken = await getFreshToken();
      if (dynamicToken) {
        config.headers.Authorization = `Bearer ${dynamicToken}`;
        // Update store with fresh token and persist if changed
        if (dynamicToken !== sessionToken) {
          useAuthStore.getState().updateSessionToken(dynamicToken);
        }
      } else if (sessionToken) {
        config.headers.Authorization = `Bearer ${sessionToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response Interceptor: Handle Global Errors (Suspension/Disable), Auto-Refresh & Retry Queue
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const originalRequest = config;

    if (!originalRequest) {
      return Promise.reject(error);
    }
    
    // Retry logic for transient errors (503, 504, or network timeout)
    if (!originalRequest.retry) originalRequest.retry = 0;
    
    const MAX_RETRIES = 3;
    const shouldRetry = (error.code === 'ECONNABORTED' || (response && [503, 504].includes(response.status)));

    if (shouldRetry && originalRequest.retry < MAX_RETRIES) {
      originalRequest.retry += 1;
      const delay = Math.pow(2, originalRequest.retry) * 1000; // Exponential backoff
      console.warn(`[API] Retrying request (${originalRequest.retry}/${MAX_RETRIES}) in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiClient(originalRequest);
    }

    if (response && response.status === 403) {
      const { code, reason } = response.data || {};
      const { setProfileStatus } = useAuthStore.getState();

      if (code === 'account_suspended') {
        console.warn('Account suspended. Redirecting...');
        setProfileStatus('SUSPENDED', reason || 'Policy Violation');
      } else if (code === 'account_disabled') {
        console.warn('Account temporarily disabled. Redirecting...');
        setProfileStatus(response.data.status || 'DISABLED');
      }
    }
    
    // SECURE TOKEN REFRESH ON 401 UNAUTHORIZED
    if (response && response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request while token is refreshing
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise(async (resolve, reject) => {
        try {
          console.log('[VENDOR-API-REFRESH] Expiry detected. Fetching fresh Firebase Token...');
          let freshToken = null;

          // Perform force refresh from Firebase SDK
          if (nativeAuth && nativeAuth().currentUser) {
            freshToken = await nativeAuth().currentUser.getIdToken(true);
          } else if (webAuth && webAuth.currentUser) {
            freshToken = await webAuth.currentUser.getIdToken(true);
          }

          if (freshToken) {
            console.log('[VENDOR-API-REFRESH] Token refresh successful. Updating store & storage...');
            
            // Update Zustand Store State and AsyncStorage via updateSessionToken action
            await useAuthStore.getState().updateSessionToken(freshToken);

            processQueue(null, freshToken);
            originalRequest.headers.Authorization = `Bearer ${freshToken}`;
            resolve(apiClient(originalRequest));
          } else {
            throw new Error('No active Firebase user session to refresh.');
          }
        } catch (refreshError) {
          console.error('[VENDOR-API-REFRESH] Permanent token refresh failure:', refreshError.message);
          processQueue(refreshError, null);
          
          // Only force logout if the user is truly unauthenticated on Firebase
          const isUserLoggedOut = refreshError.code === 'auth/user-token-expired' || 
                              refreshError.code === 'auth/user-not-found' ||
                              refreshError.message.includes('no active session') ||
                              refreshError.message.includes('No active Firebase user session');
          
          if (isUserLoggedOut) {
            useAuthStore.getState().logout();
          }
          reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      });
    }

    return Promise.reject(error);
  }
);

export default apiClient;
