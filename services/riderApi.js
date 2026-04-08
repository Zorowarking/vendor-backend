import apiClient from './api';

const getClient = () => apiClient;

export const riderApi = {
  toggleStatus: async (isOnline) => {
    try {
      const response = await apiClient.put('/rider/status/toggle', { isOnline });
      return response.data;
    } catch (error) {
      console.warn('riderApi.toggleStatus mock fallback:', error.message);
      return { success: true, isOnline };
    }
  },
  
  getPickupRequests: async () => {
    try {
      const client = getClient();
      const response = await client.get('/rider/requests');
      return response.data;
    } catch (error) {
      console.warn('riderApi.getPickupRequests mock fallback:', error.message);
      return [
        {
          id: 'REQ_' + Date.now(),
          vendorName: 'Gourmet Pizza Co.',
          vendorAddress: '123 Pizza St, New York',
          customerAddress: '456 Delivery Ave, New York',
          distance: '3.2 km',
          orderAmount: 45.50,
          estimatedEarnings: 8.50,
          timer: 60
        }
      ];
    }
  },

  acceptRequest: async (requestId) => {
    try {
      const client = getClient();
      const response = await client.put(`/rider/requests/${requestId}/accept`);
      return response.data;
    } catch (error) {
      console.warn('riderApi.acceptRequest mock fallback:', error.message);
      return { success: true };
    }
  },

  rejectRequest: async (requestId) => {
    try {
      const response = await apiClient.put(`/rider/requests/${requestId}/reject`);
      return response.data;
    } catch (error) {
      console.warn('riderApi.rejectRequest mock fallback:', error.message);
      return { success: true };
    }
  },

  updateDeliveryStatus: async (orderId, status, extraData = {}) => {
    try {
      const response = await apiClient.put(`/rider/orders/${orderId}/status`, { status, ...extraData });
      return response.data;

    } catch (error) {
      console.warn('riderApi.updateDeliveryStatus mock fallback:', error.message);
      return { success: true };
    }
  },

  updateLocation: async (data) => {
    try {
      const response = await apiClient.post('/rider/location', data);
      return response.data;
    } catch (error) {
      // Sliently fail mock location updates
      return { success: true };
    }
  },

  getEarnings: async (period = 'today') => {
    try {
      const response = await apiClient.get(`/rider/earnings?period=${period}`);
      return response.data;
    } catch (error) {
      console.warn('riderApi.getEarnings mock fallback:', error.message);
      return {
        totalEarnings: 1240.50,
        completedDeliveries: 15,
        fixedPay: 900.00,
        distanceBonus: 340.50,
        history: [
          { 
            id: '1', date: '2026-04-07', orderId: 'ORD123', 
            fixedAmount: 5.00, distanceBonus: 3.50, amount: 8.50, 
            status: 'DELIVERED' 
          },
          { 
            id: '2', date: '2026-04-07', orderId: 'ORD124', 
            fixedAmount: 5.00, distanceBonus: 4.20, amount: 9.20, 
            status: 'DELIVERED' 
          },
          { 
            id: '3', date: '2026-04-06', orderId: 'ORD125', 
            fixedAmount: 5.00, distanceBonus: 2.50, amount: 7.50, 
            status: 'DELIVERED' 
          },
        ]
      };
    }
  },

  getProfile: async () => {
    try {
      const client = getClient();
      const response = await client.get('/rider/profile');
      return response.data;
    } catch (error) {
      console.warn('riderApi.getProfile mock fallback:', error.message);
      return {
        fullName: 'Alex Delivery',
        phone: '+1 987 654 3210',
        email: 'alex@example.com',
        photo: 'https://i.pravatar.cc/150?u=alex',
        vehicleDetails: { type: 'Bike', number: 'NY-1234' },
        preferredZone: 'Downtown NY',
        kycStatus: 'Approved',
        complianceFlags: ['LATE_PICKUP']
      };
    }
  }
};
