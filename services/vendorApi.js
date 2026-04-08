import apiClient from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getClient = () => apiClient;

const MOCK_PRODUCTS_KEY = 'vendor_mock_products_v1';

// Initial default products
const DEFAULT_PRODUCTS = [
  { id: '1', name: 'Margherita Pizza', price: 12.99, category: 'Pizza', type: 'Veg', isAvailable: true, image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3', addOns: [] },
  { id: '2', name: 'Pepperoni Pizza', price: 14.99, category: 'Pizza', type: 'Non-Veg', isAvailable: true, image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e', addOns: [] },
  { id: '3', name: 'Veggie Burger', price: 9.99, category: 'Burgers', type: 'Veg', isAvailable: false, image: 'https://images.unsplash.com/photo-1512152272829-e3139592d56f', addOns: [] },
];

let mockProducts = [...DEFAULT_PRODUCTS];

// Helper to persist mocks
const syncMocks = async () => {
  try {
    await AsyncStorage.setItem(MOCK_PRODUCTS_KEY, JSON.stringify(mockProducts));
  } catch (e) {
    console.error('Failed to sync mocks to storage');
  }
};

// Immediately load from storage if available
AsyncStorage.getItem(MOCK_PRODUCTS_KEY).then(data => {
  if (data) mockProducts = JSON.parse(data);
});

export const vendorApi = {
  toggleStatus: async (isOnline) => {
    try {
      const response = await apiClient.put('/vendor/status/toggle', { isOnline });
      return response.data;
    } catch (error) {
      console.warn('vendorApi.toggleStatus mock fallback:', error.message);
      return { success: true, isOnline };
    }
  },
  
  getEarnings: async (period = 'today') => {
    try {
      const response = await apiClient.get(`/vendor/earnings?period=${period}`);
      return response.data;
    } catch (error) {
      console.warn('vendorApi.getEarnings mock fallback:', error.message);
      return { 
        revenue: 1250.75, 
        commission: 125.07, 
        net: 1125.68, 
        orderCount: 42,
        chartData: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [{ data: [20, 45, 28, 80, 99, 43, 50] }]
        },
        breakdown: [
          { date: '2026-04-07', count: 12, gross: 350.00, commission: 35.00, net: 315.00 },
          { date: '2026-04-06', count: 15, gross: 420.50, commission: 42.05, net: 378.45 },
        ]
      };
    }
  },

  getProducts: async () => {
    try {
      const client = getClient();
      const response = await client.get('/vendor/products');
      const data = response.data;
      
      // Strict array check to prevent UI crashes
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.products)) return data.products;
      if (data && Array.isArray(data.data)) return data.data;
      
      return [];
    } catch (error) {
      // Return local cache from storage to ensure it's up to date
      try {
        const dataStr = await AsyncStorage.getItem(MOCK_PRODUCTS_KEY);
        if (dataStr) {
          const parsed = JSON.parse(dataStr);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.error('Failed to load mock products from storage');
      }
      return [...(DEFAULT_PRODUCTS || [])];
    }
  },

  addProduct: async (data) => {
    try {
      const client = getClient();
      const response = await client.post('/vendor/products', data);
      return response.data;
    } catch (error) {
      console.warn('vendorApi.addProduct mock fallback (persisting to storage):', error.message);
      const newProduct = { ...data, id: Date.now().toString() };
      mockProducts = [newProduct, ...mockProducts];
      await syncMocks();
      return { success: true, id: newProduct.id, product: newProduct };
    }
  },

  updateProduct: async (id, data) => {
    try {
      const client = getClient();
      const response = await client.put(`/vendor/products/${id}`, data);
      return response.data;
    } catch (error) {
      mockProducts = mockProducts.map(p => p.id === id ? { ...p, ...data } : p);
      await syncMocks();
      return { success: true };
    }
  },

  deleteProduct: async (id) => {
    try {
      const response = await apiClient.delete(`/vendor/products/${id}`);
      return response.data;
    } catch (error) {
      mockProducts = mockProducts.filter(p => p.id !== id);
      await syncMocks();
      return { success: true };
    }
  },

  toggleProductAvailability: async (id, isAvailable) => {
    try {
      const response = await apiClient.put(`/vendor/products/${id}`, { isAvailable });
      return response.data;
    } catch (error) {
      mockProducts = mockProducts.map(p => p.id === id ? { ...p, isAvailable } : p);
      await syncMocks();
      return { success: true };
    }
  },

  getProfile: async () => {
    try {
      const response = await apiClient.get('/vendor/profile');
      return response.data;
    } catch (error) {
      console.warn('vendorApi.getProfile mock fallback:', error.message);
      return {
        businessName: 'Gourmet Pizza Co.',
        ownerName: 'John Doe',
        phone: '+1 234 567 8900',
        email: 'john@gourmetpizza.com',
        category: 'Italian',
        description: 'Authentic stone-baked pizzas with fresh ingredients.',
        operatingHours: '10:00 AM - 11:00 PM',
        location: { latitude: 40.7128, longitude: -74.0060, address: '123 Pizza St, New York' },
        logo: 'https://images.unsplash.com/photo-1594212699903-ec8a3eea50f6',
        banner: 'https://images.unsplash.com/photo-1513104890138-7c749659a591',
        bankDetails: { accountNumber: '****6789', bankName: 'Global Bank' },
        kycStatus: 'Approved',
        complianceFlags: []
      };
    }
  },

  updateProfile: async (data) => {
    try {
      const client = getClient();
      const response = await client.put('/vendor/profile', data);
      return response.data;
    } catch (error) {
      console.warn('vendorApi.updateProfile mock fallback:', error.message);
      return { success: true };
    }
  },

  uploadImage: async (uri) => {
    // Transparent Mock: Use the local URI for immediate UI feedback in development
    console.log('[DEV MOCK] Uploading image...', uri);
    await new Promise(resolve => setTimeout(resolve, 800));
    return { url: uri, success: true };
  },

  acceptOrder: async (orderId) => {
    try {
      const response = await apiClient.put(`/vendor/orders/${orderId}/accept`);
      return response.data;
    } catch (error) {
      console.warn('vendorApi.acceptOrder mock fallback:', error.message);
      return { success: true };
    }
  },

  rejectOrder: async (orderId, reason) => {
    try {
      const response = await apiClient.put(`/vendor/orders/${orderId}/reject`, { reason });
      return response.data;
    } catch (error) {
      console.warn('vendorApi.rejectOrder mock fallback:', error.message);
      return { success: true };
    }
  },

  updateOrderStatus: async (orderId, status) => {
    try {
      const response = await apiClient.put(`/vendor/orders/${orderId}/status`, { status });
      return response.data;
    } catch (error) {
      console.warn('vendorApi.updateOrderStatus mock fallback:', error.message);
      return { success: true };
    }
  }
};
