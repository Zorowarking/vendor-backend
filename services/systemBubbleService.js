import { Platform, NativeModules } from 'react-native';

let FloatingBubble = null;
try {
  // Only require if the native module is detected
  if (NativeModules.RNFloatingBubble || NativeModules.FloatingBubble) {
    FloatingBubble = require('react-native-floating-bubble');
  }
} catch (e) {
  // Library not found or not a native build
}

export const systemBubbleService = {
  /**
   * Initialize the system-level bubble (Android only)
   */
  initialize: () => {
    // Defensive check: Only run on Android and if the native module is actually linked
    if (Platform.OS !== 'android') return;
    
    try {
      if (!FloatingBubble || typeof FloatingBubble.initialize !== 'function') {
        console.warn('[BUBBLE] FloatingBubble native module not available (expected in Expo Go).');
        return;
      }
      
      FloatingBubble.initialize()
        .then(() => console.log('[BUBBLE] System bubble initialized'))
        .catch((e) => console.warn('[BUBBLE] Initialization failed:', e.message));
    } catch (e) {
      console.warn('[BUBBLE] Critical error during initialization:', e.message);
    }
  },

  /**
   * Show the system bubble
   */
  show: () => {
    if (Platform.OS !== 'android' || !FloatingBubble || typeof FloatingBubble.showFloatingBubble !== 'function') return;
    
    try {
      FloatingBubble.showFloatingBubble(10, 10)
        .then(() => console.log('[BUBBLE] Bubble shown'))
        .catch((e) => console.warn('[BUBBLE] Failed to show bubble:', e.message));
    } catch (e) {
      console.warn('[BUBBLE] Error calling showFloatingBubble:', e.message);
    }
  },

  /**
   * Hide the system bubble
   */
  hide: () => {
    if (Platform.OS !== 'android' || !FloatingBubble || typeof FloatingBubble.hideFloatingBubble !== 'function') return;
    
    try {
      FloatingBubble.hideFloatingBubble()
        .then(() => console.log('[BUBBLE] Bubble hidden'))
        .catch((e) => console.warn('[BUBBLE] Failed to hide bubble:', e.message));
    } catch (e) {
      console.warn('[BUBBLE] Error calling hideFloatingBubble:', e.message);
    }
  },

  /**
   * Update the badge/count on the bubble
   */
  update: (count) => {
    // Note: react-native-floating-bubble doesn't natively support dynamic badge counts in the simplest version,
    // but we can re-show it or handle custom views if needed.
    if (count > 0) {
      systemBubbleService.show();
    } else {
      systemBubbleService.hide();
    }
  }
};
