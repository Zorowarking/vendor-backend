import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const getApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  // Fallback for local development if env is missing
  return 'https://vendor-backend-production-c171.up.railway.app/api';
};

const API_BASE_URL = getApiBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Auth Token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().sessionToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
        console.warn('Account permanently disabled. Redirecting...');
        setProfileStatus('DISABLED');
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
