import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useRiderStore = create()(
  persist(
    (set) => ({
      isOnline: false,
      activeOrder: null, // Current active delivery
      pickupRequests: [], // Queue for incoming modal requests
      riderStats: {
        totalEarnings: 0,
        completedDeliveries: 0,
        fixedPay: 0,
        distanceBonus: 0
      },
      currentLocation: null, // { latitude, longitude }
      
      setOnlineStatus: (status) => set({ isOnline: status }),
      
      setActiveOrder: (order) => set({ activeOrder: order }),
      
      addPickupRequest: (request) => set((state) => {
        if (state.pickupRequests.find(r => r.id === request.id)) return state;
        return { pickupRequests: [...state.pickupRequests, request] };
      }),
      
      removePickupRequest: (requestId) => set((state) => ({
        pickupRequests: state.pickupRequests.filter(r => r.id !== requestId)
      })),
      
      updateRiderStats: (stats) => set({ riderStats: stats }),
      
      updateCurrentLocation: (location) => set({ currentLocation: location }),
      
      clearStore: () => set({
        isOnline: false,
        activeOrder: null,
        pickupRequests: [],
        riderStats: {
          totalEarnings: 0,
          completedDeliveries: 0,
          fixedPay: 0,
          distanceBonus: 0
        },
        currentLocation: null
      })
    }),
    {
      name: 'rider-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
