import apiClient from './api';

const getClient = () => apiClient;

export const riderApi = {
  submitKyc: async (data) => {
    const response = await apiClient.post('/api/rider/kyc', data);
    return response.data;
  },

  toggleStatus: async (isOnline) => {
    const response = await apiClient.put('/api/rider/status/toggle', { isOnline });
    return response.data;
  },
  
  getPickupRequests: async () => {
    const response = await apiClient.get('/api/rider/requests');
    return response.data.requests || [];
  },

  acceptRequest: async (requestId) => {
    const response = await apiClient.put(`/api/rider/requests/${requestId}/accept`);
    return response.data;
  },

  rejectRequest: async (requestId) => {
    const response = await apiClient.put(`/api/rider/requests/${requestId}/reject`);
    return response.data;
  },

  updateDeliveryStatus: async (orderId, status, extraData = {}) => {
    const response = await apiClient.put(`/api/rider/orders/${orderId}/status`, { status, ...extraData });
    return response.data;
  },

  updateLocation: async (data) => {
    const response = await apiClient.post('/api/rider/location', data);
    return response.data;
  },

  getEarnings: async (period = 'daily') => {
    const response = await apiClient.get(`/api/rider/earnings?period=${period}`);
    return response.data;
  },

  getProfile: async () => {
    const response = await apiClient.get('/api/rider/profile');
    return response.data.rider;
  },

  updateProfile: async (data) => {
    const response = await apiClient.put('/api/rider/profile', data);
    return response.data;
  }
};
