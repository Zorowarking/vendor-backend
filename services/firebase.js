import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyCDxTu_2sK2VFObrNLUICrddAi-hR67Tcs",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "vantyrn-e20f0.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "vantyrn-e20f0",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "vantyrn-e20f0.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "889299912788",
  appId: Platform.select({
    android: process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:889299912788:android:b33817fbea8a04157445c1",
    ios: process.env.EXPO_PUBLIC_FIREBASE_APP_ID_IOS || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:889299912788:ios:56885699478855447445c1",
    default: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:889299912788:web:f2b9726779152d917445c1"
  })
};


// Initialize Firebase
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Auth with Persistence using AsyncStorage, with robust crash protection
let auth;
let resolveAuthInit;
const authInitialized = new Promise((resolve) => {
  resolveAuthInit = resolve;
});

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  console.log('[FIREBASE] Auth already initialized or persistence failed, using getAuth fallback.');
  auth = getAuth(app);
}

// One-time listener to resolve the startup initialization promise safely
let isResolved = false;
const unsubscribe = auth.onAuthStateChanged((user) => {
  if (!isResolved) {
    isResolved = true;
    resolveAuthInit();
  }
  // Safe unsubscribe invocation (avoid race condition if synchronous)
  setTimeout(() => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }, 0);
});

// Safety timeout fallback (6 seconds for poor network resilience)
setTimeout(() => {
  if (!isResolved) {
    isResolved = true;
    resolveAuthInit();
    console.log('[FIREBASE] Auth initialization safety fallback triggered after 6 seconds');
  }
}, 6000);

export { app, auth, authInitialized };

