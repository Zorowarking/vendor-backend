import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
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

// Response Interceptor: Handle Global Errors (Suspension/Disable)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 403) {
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
