import { create } from 'zustand';

export const useNotificationStore = create((set) => ({
  activeNotification: null,
  
  setActiveNotification: (notification) => set({ activeNotification: notification }),
  
  clearNotification: () => set({ activeNotification: null }),

  /**
   * Helper to trigger a local/mock notification
   */
  triggerLocalNotification: (type, title, body, data = {}) => {
    set({ 
      activeNotification: {
        notification: { title, body },
        data: { type, ...data }
      }
    });
  }
}));
