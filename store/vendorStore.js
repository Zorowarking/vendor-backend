import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useVendorStore = create()(
  persist(
    (set, get) => ({
      isOnline: false,
      incomingOrders: [], // Orders waiting for acceptance
      activeOrders: [],   // Accepted, Preparing, Ready
      orderHistory: [],   // Completed, Cancelled
      vendorStats: null,
      products: [],
      lastSynced: null,
      
      setProducts: (data) => {
        const productsArr = Array.isArray(data) ? data : (data && Array.isArray(data.products) ? data.products : []);
        set({ products: productsArr, lastSynced: Date.now() });
      },
      addProductToStore: (product) => set((state) => {
        const currentProducts = Array.isArray(state.products) ? state.products : [];
        return { 
          products: [product, ...currentProducts],
          lastSynced: Date.now() 
        };
      }),
      
      setOnlineStatus: (status) => set({ isOnline: status }),
      
      addIncomingOrder: (order) => set((state) => {
        if (state.incomingOrders.find(o => o.id === order.id)) return state;
        return { incomingOrders: [order, ...state.incomingOrders] };
      }),

      removeIncomingOrder: (orderId) => set((state) => ({
        incomingOrders: state.incomingOrders.filter(o => o.id !== orderId)
      })),

      addActiveOrder: (order) => set((state) => {
        if (state.activeOrders.find(o => o.id === order.id)) return state;
        return { activeOrders: [order, ...state.activeOrders] };
      }),

      moveToHistory: (orderId) => set((state) => {
        const target = state.activeOrders.find(o => o.id === orderId) || state.incomingOrders.find(o => o.id === orderId);
        if (!target) return state;
        return {
          incomingOrders: state.incomingOrders.filter(o => o.id !== orderId),
          activeOrders: state.activeOrders.filter(o => o.id !== orderId),
          orderHistory: [target, ...state.orderHistory]
        };
      }),

      updateOrder: (orderId, updates) => set((state) => {
        let newIncoming = state.incomingOrders.map(o => o.id === orderId ? { ...o, ...updates } : o);
        let newActive = state.activeOrders.map(o => o.id === orderId ? { ...o, ...updates } : o);
        let newHistory = state.orderHistory.map(o => o.id === orderId ? { ...o, ...updates } : o);
        return { incomingOrders: newIncoming, activeOrders: newActive, orderHistory: newHistory };
      }),

      setVendorStats: (stats) => set({ vendorStats: stats }),

      clearStore: () => set({
        isOnline: false,
        incomingOrders: [],
        activeOrders: [],
        orderHistory: [],
        vendorStats: null,
        products: []
      })
    }),
    {
      name: 'vendor-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
