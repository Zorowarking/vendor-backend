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

import { auth as webAuth } from './firebase';
import { NativeModules } from 'react-native';

// Safely require native firebase auth
let nativeAuth = null;
try {
  if (NativeModules.RNFBAppModule) {
    nativeAuth = require('@react-native-firebase/auth').default;
  }
} catch (e) {}

const getFreshToken = async () => {
  try {
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
        // Update store with fresh token if changed
        if (dynamicToken !== sessionToken) {
          useAuthStore.setState({ sessionToken: dynamicToken });
        }
      } else if (sessionToken) {
        config.headers.Authorization = `Bearer ${sessionToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle Global Errors (Suspension/Disable) and Retries
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    
    // Retry logic for transient errors (503, 504, or network timeout)
    if (!config || !config.retry) config.retry = 0;
    
    const MAX_RETRIES = 3;
    const shouldRetry = (error.code === 'ECONNABORTED' || (response && [503, 504].includes(response.status)));

    if (shouldRetry && config.retry < MAX_RETRIES) {
      config.retry += 1;
      const delay = Math.pow(2, config.retry) * 1000; // Exponential backoff
      console.warn(`[API] Retrying request (${config.retry}/${MAX_RETRIES}) in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiClient(config);
    }

    if (response && response.status === 403) {
      const { code, reason } = error.response.data || {};
      const { setProfileStatus } = useAuthStore.getState();

      if (code === 'account_suspended') {
        console.warn('Account suspended. Redirecting...');
        setProfileStatus('SUSPENDED', reason || 'Policy Violation');
      } else if (code === 'account_disabled') {
        console.warn('Account temporarily disabled. Redirecting...');
        setProfileStatus(error.response.data.status || 'DISABLED');
      }
    }
    
    // Auto-logout on 401 Unauthorized
    if (error.response && error.response.status === 401) {
      useAuthStore.getState().logout();
    }

    return Promise.reject(error);
  }
);

export default apiClient;
