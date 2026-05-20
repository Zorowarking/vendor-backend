import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useVendorStore = create()(
  persist(
    (set, get) => ({
      onlineStatus: 'offline', // 'online', 'offline', 'stop_new_orders'
      appState: 'active',      // 'active', 'background', 'inactive'
      hasUnreadActivity: false,
      incomingOrders: [], // Orders waiting for acceptance
      activeOrders: [],   // Accepted, Preparing, Ready
      orderHistory: [],   // Completed, Cancelled
      vendorStats: null,
      products: [],
      lastSynced: null,

      // ─── Unread Order Badge ─────────────────────────────────────────────
      // Persisted Set of order IDs that the vendor has already viewed.
      // Unread count = incomingOrders.length - (ids already seen)
      viewedOrderIds: [],

      setAppState: (state) => set({ appState: state }),
      setHasUnreadActivity: (val) => set({ hasUnreadActivity: val }),

      // ─── Mark Order as Viewed ──────────────────────────────────────────
      // Call when the vendor opens any order detail or views the orders tab.
      markOrderAsViewed: (orderId) => set((state) => {
        if (state.viewedOrderIds.includes(orderId)) return state;
        return { viewedOrderIds: [...state.viewedOrderIds, orderId] };
      }),

      // Mark all current incoming orders as viewed at once (when tab opens)
      markAllIncomingAsViewed: () => set((state) => {
        const newIds = state.incomingOrders
          .map(o => o.id)
          .filter(id => !state.viewedOrderIds.includes(id));
        if (newIds.length === 0) return state;
        return { viewedOrderIds: [...state.viewedOrderIds, ...newIds] };
      }),

      // Selector-style getter: returns count of unread (unseen) incoming orders
      getUnreadOrderCount: () => {
        const state = get();
        const seen = new Set(state.viewedOrderIds);
        return state.incomingOrders.filter(o => !seen.has(o.id)).length;
      },

      // Prune viewedOrderIds: remove IDs no longer in any order list
      // Prevents unbounded growth in high-traffic production environments (1000+ orders)
      pruneViewedOrderIds: () => set((state) => {
        const allOrderIds = new Set([
          ...state.incomingOrders.map(o => o.id),
          ...state.activeOrders.map(o => o.id),
          ...state.orderHistory.slice(0, 100).map(o => o.id) // keep last 100 history IDs
        ]);
        const pruned = state.viewedOrderIds.filter(id => allOrderIds.has(id));
        if (pruned.length === state.viewedOrderIds.length) return state; // no change
        return { viewedOrderIds: pruned };
      }),

      // ─── Products ──────────────────────────────────────────────────────
      setProducts: (data) => {
        const currentProducts = get().products;
        const resolvedData = typeof data === 'function' ? data(currentProducts) : data;
        const productsArr = Array.isArray(resolvedData)
          ? resolvedData
          : (resolvedData && Array.isArray(resolvedData.products) ? resolvedData.products : []);
        set({ products: productsArr, lastSynced: Date.now() });
      },

      addProductToStore: (product) => set((state) => {
        const currentProducts = Array.isArray(state.products) ? state.products : [];
        return {
          products: [product, ...currentProducts],
          lastSynced: Date.now()
        };
      }),

      // ─── Status ────────────────────────────────────────────────────────
      setOnlineStatus: (status) => set({ onlineStatus: status }),

      // ─── Orders ────────────────────────────────────────────────────────
      setOrders: (active, history) => set({
        activeOrders: active.filter(o => o.status !== 'pending_vendor'),
        incomingOrders: active.filter(o => o.status === 'pending_vendor'),
        orderHistory: history
      }),

      addIncomingOrder: (order) => set((state) => {
        // Deduplication: skip if same order already in queue
        if (state.incomingOrders.find(o => o.id === order.id)) return state;
        return { incomingOrders: [order, ...state.incomingOrders] };
      }),

      removeIncomingOrder: (orderId) => set((state) => {
        const updated = {
          incomingOrders: state.incomingOrders.filter(o => o.id !== orderId)
        };
        // Prune stale viewedOrderIds when order is removed
        const remainingIds = new Set(updated.incomingOrders.map(o => o.id));
        updated.viewedOrderIds = state.viewedOrderIds.filter(id => remainingIds.has(id) || state.activeOrders.some(o => o.id === id));
        return updated;
      }),

      addActiveOrder: (order) => set((state) => {
        if (state.activeOrders.find(o => o.id === order.id)) return state;
        return { activeOrders: [order, ...state.activeOrders] };
      }),

      moveToHistory: (orderId) => set((state) => {
        const target =
          state.activeOrders.find(o => o.id === orderId) ||
          state.incomingOrders.find(o => o.id === orderId);
        if (!target) return state;
        const newHistory = [target, ...state.orderHistory].slice(0, 150); // cap history at 150
        return {
          incomingOrders: state.incomingOrders.filter(o => o.id !== orderId),
          activeOrders: state.activeOrders.filter(o => o.id !== orderId),
          orderHistory: newHistory,
          // Prune viewedOrderIds: keep only still-relevant IDs
          viewedOrderIds: state.viewedOrderIds.filter(
            id => id !== orderId || newHistory.some(o => o.id === id)
          )
        };
      }),

      updateOrder: (orderId, updates) => set((state) => ({
        incomingOrders: state.incomingOrders.map(o => o.id === orderId ? { ...o, ...updates } : o),
        activeOrders: state.activeOrders.map(o => o.id === orderId ? { ...o, ...updates } : o),
        orderHistory: state.orderHistory.map(o => o.id === orderId ? { ...o, ...updates } : o),
      })),

      setVendorStats: (stats) => set({ vendorStats: stats }),

      clearStore: () => set({
        onlineStatus: 'offline',
        incomingOrders: [],
        activeOrders: [],
        orderHistory: [],
        vendorStats: null,
        products: [],
        viewedOrderIds: [],
        hasUnreadActivity: false,
      }),
    }),
    {
      name: 'vendor-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState, version) => {
        const defaultState = {
          onlineStatus: 'offline',
          appState: 'active',
          hasUnreadActivity: false,
          incomingOrders: [],
          activeOrders: [],
          orderHistory: [],
          vendorStats: null,
          products: [],
          lastSynced: null,
          viewedOrderIds: [],
        };
        return { ...defaultState, ...persistedState };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[STORE] vendorStore Hydration failed:', error);
        }
      }
    }
  )
);
