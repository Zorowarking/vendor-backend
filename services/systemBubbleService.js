import { Platform, NativeModules, AppState, DeviceEventEmitter } from 'react-native';

let FloatingBubble = null;
try {
  // Only require if the native module is detected
  if (NativeModules.RNFloatingBubble || NativeModules.FloatingBubble) {
    FloatingBubble = require('react-native-floating-bubble');
  }
} catch (e) {
  // Library not found or not a native build
}

let isInitialized = false;
let isBubbleShown = false;

export const systemBubbleService = {
  isProgrammaticHide: false,

  /**
   * Check if overlay permission is granted
   */
  hasPermission: async () => {
    if (Platform.OS !== 'android' || !FloatingBubble) return false;
    try {
      if (typeof FloatingBubble.checkPermission === 'function') {
        return await FloatingBubble.checkPermission();
      }
    } catch (e) {
      console.warn('[BUBBLE] Error checking permission:', e.message);
    }
    return false;
  },

  /**
   * Request overlay permission ("Draw over other apps")
   */
  requestPermission: async () => {
    if (Platform.OS !== 'android' || !FloatingBubble) return false;
    try {
      if (typeof FloatingBubble.requestPermission === 'function') {
        await FloatingBubble.requestPermission();
        return await systemBubbleService.hasPermission();
      }
    } catch (e) {
      console.warn('[BUBBLE] Error requesting permission:', e.message);
    }
    return false;
  },

  /**
   * Initialize the system-level bubble (Android only)
   */
  initialize: async () => {
    // Defensive check: Only run on Android and if the native module is actually linked
    if (Platform.OS !== 'android') return;
    if (isInitialized) return;
    
    try {
      if (!FloatingBubble || typeof FloatingBubble.initialize !== 'function') {
        console.warn('[BUBBLE] FloatingBubble native module not available (expected in Expo Go).');
        return;
      }
      
      // Prevent crash: check permission before calling native initialize
      const hasPerm = await systemBubbleService.hasPermission();
      if (!hasPerm) {
        console.log('[BUBBLE] Overlay permission not granted. Skipping initialization to prevent native crashes.');
        return;
      }

      await FloatingBubble.initialize();
      isInitialized = true;
      
      // Clean up any pre-existing bubble from a previous crash or service launch
      try {
        await FloatingBubble.hideFloatingBubble();
      } catch (err) {}
      isBubbleShown = false;

      // Sync state when user manually closes bubble
      DeviceEventEmitter.addListener('floating-bubble-remove', () => {
        console.log('[BUBBLE-SERVICE] Bubble removed by user, setting isBubbleShown = false');
        isBubbleShown = false;
      });

      // Sync state when user presses bubble
      DeviceEventEmitter.addListener('floating-bubble-press', () => {
        console.log('[BUBBLE-SERVICE] Bubble pressed by user, setting isBubbleShown = false');
        isBubbleShown = false;
      });

      console.log('[BUBBLE] System bubble initialized successfully');
    } catch (e) {
      console.warn('[BUBBLE] Critical error during initialization:', e.message);
    }
  },

  /**
   * Show the system bubble
   */
  show: async () => {
    if (Platform.OS !== 'android' || !FloatingBubble || typeof FloatingBubble.showFloatingBubble !== 'function') return;
    
    // Safety check: Avoid showing the bubble if the app is currently in the foreground (active)
    if (AppState.currentState === 'active') {
      console.log('[BUBBLE] Skipping show: App is active in foreground');
      return;
    }

    // Singleton Enforcement: Prevent duplicate overlay creation
    if (isBubbleShown) {
      console.log('[BUBBLE] Skipping show: Bubble is already visible');
      return;
    }
    
    try {
      const hasPerm = await systemBubbleService.hasPermission();
      if (!hasPerm) {
        console.log('[BUBBLE] Cannot show bubble: overlay permission not granted.');
        return;
      }

      if (!isInitialized) {
        await FloatingBubble.initialize();
        isInitialized = true;
      }

      await FloatingBubble.showFloatingBubble(10, 10);
      isBubbleShown = true;
      console.log('[BUBBLE] Bubble shown');
    } catch (e) {
      console.warn('[BUBBLE] Error calling showFloatingBubble:', e.message);
    }
  },

  /**
   * Hide the system bubble
   */
  hide: async () => {
    if (Platform.OS !== 'android' || !FloatingBubble || typeof FloatingBubble.hideFloatingBubble !== 'function') return;
    
    try {
      if (!isInitialized) return;
      
      systemBubbleService.isProgrammaticHide = true;
      // Prevent redundant calls and clean up state safely
      await FloatingBubble.hideFloatingBubble();
      isBubbleShown = false;
      console.log('[BUBBLE] Bubble hidden');
    } catch (e) {
      // Even if native hide fails, reset the state to allow future recovery
      isBubbleShown = false;
      console.warn('[BUBBLE] Error calling hideFloatingBubble:', e.message);
    }
  },

  /**
   * Reopen the application from background/overlay
   */
  reopen: async () => {
    if (Platform.OS !== 'android' || !FloatingBubble || typeof FloatingBubble.reopenApp !== 'function') return;
    try {
      systemBubbleService.isProgrammaticHide = true;
      await FloatingBubble.reopenApp();
      console.log('[BUBBLE] App reopened successfully');
      
      // Clean up bubble when app is reopened
      await systemBubbleService.hide();
    } catch (e) {
      console.warn('[BUBBLE] Error calling reopenApp:', e.message);
    }
  },

  /**
   * Update the badge/count on the bubble
   */
  update: (count) => {
    if (count > 0) {
      systemBubbleService.show();
    } else {
      systemBubbleService.hide();
    }
  }
};

