import axios from 'axios';
import apiClient from './api';

const getClient = () => apiClient;

export const vendorApi = {
  submitKyc: async (data) => {
    const response = await apiClient.post('/api/vendor/kyc', data);
    return response.data;
  },

  toggleStatus: async (isOnline, dismissBubble = false) => {
    const response = await apiClient.put('/api/vendor/status/toggle', { isOnline, dismissBubble });
    return response.data;
  },
  
  getEarnings: async (period = 'daily') => {
    try {
      const response = await apiClient.get(`/api/vendor/earnings?period=${period}`);
      return response.data;
    } catch (e) {
      if (e.response?.status === 404) return { revenue: 0, orderCount: 0, chartData: null, breakdown: [] };
      throw e;
    }
  },

  getProducts: async () => {
    try {
      const client = getClient();
      const response = await client.get('/api/vendor/products');
      const data = response.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.products)) return data.products;
      return [];
    } catch (e) {
      if (e.response?.status === 404) return [];
      throw e;
    }
  },

  getTemplates: async () => {
    const response = await apiClient.get('/api/vendor/products/templates');
    return response.data;
  },

  addProduct: async (data) => {
    const client = getClient();
    const response = await client.post('/api/vendor/products', data);
    return response.data;
  },

  updateProduct: async (id, data) => {
    const client = getClient();
    const response = await client.put(`/api/vendor/products/${id}`, data);
    return response.data;
  },

  deleteProduct: async (id) => {
    const response = await apiClient.delete(`/api/vendor/products/${id}`);
    return response.data;
  },

  toggleProductAvailability: async (id, isAvailable) => {
    const response = await apiClient.put(`/api/vendor/products/${id}`, { isAvailable });
    return response.data;
  },

  getProfile: async () => {
    try {
      const response = await apiClient.get('/api/vendor/profile');
      return response.data.vendor;
    } catch (e) {
      if (e.response?.status === 404) return null;
      throw e;
    }
  },


  updateProfile: async (data) => {
    const client = getClient();
    const response = await client.put('/api/vendor/profile', data);
    return response.data;
  },

  uploadImage: async (uri) => {
    try {
      const fileName = uri.split('/').pop();
      const extension = fileName.split('.').pop();
      // Handle both images and PDFs for KYC
      const contentType = extension === 'pdf' ? 'application/pdf' : `image/${extension === 'jpg' ? 'jpeg' : extension}`;

      console.log(`[API] Requesting presigned URL for ${fileName} (${contentType})`);

      // 1. Get presigned URL from our backend
      const { uploadUrl, publicUrl } = await apiClient.get('/api/storage/presigned-url', {
        params: { 
          fileName,
          contentType 
        }
      }).then(res => res.data);

      console.log(`[API] Got upload URL. Sending binary to R2...`);

      // 2. Upload file directly to R2
      const response = await fetch(uri);
      const blob = await response.blob();

      await axios.put(uploadUrl, blob, {
        headers: {
          'Content-Type': contentType
        }
      });

      console.log(`[API] Upload successful. Public URL: ${publicUrl}`);
      return { url: publicUrl, success: true };
    } catch (error) {
      console.error('[API] Image upload failed:', error);
      throw error;
    }
  },

  acceptOrder: async (orderId) => {
    const response = await apiClient.put(`/api/vendor/orders/${orderId}/accept`);
    return response.data;
  },

  rejectOrder: async (orderId, reason, otherNotes) => {
    const response = await apiClient.put(`/api/vendor/orders/${orderId}/reject`, { reason, otherNotes });
    return response.data;
  },

  contactSupport: async (orderId) => {
    const response = await apiClient.put(`/api/vendor/orders/${orderId}/contact-support`);
    return response.data;
  },

  updateOrderStatus: async (orderId, status) => {
    const response = await apiClient.put(`/api/vendor/orders/${orderId}/status`, { status });
    return response.data;
  },
  
  getOrders: async () => {
    const response = await apiClient.get('/api/vendor/orders');
    return response.data;
  }
};
