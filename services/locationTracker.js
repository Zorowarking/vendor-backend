import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Linking } from 'react-native';
import { riderApi } from './riderApi';
import { socketService } from './socketService';

import { useRiderStore } from '../store/riderStore';

const LOCATION_TRACKING_TASK = 'background-location-tracking';

const syncLocation = (latitude, longitude) => {
  // Update local store for UI responsiveness
  useRiderStore.getState().updateCurrentLocation({ latitude, longitude });
  
  // Sync with backend/socket if there's an active order
  const activeOrder = useRiderStore.getState().activeOrder;
  if (activeOrder) {
    riderApi.updateLocation({ orderId: activeOrder.id, latitude, longitude });
    socketService.emitLocation(activeOrder.id, latitude, longitude);
  }
};

// Define the background task
TaskManager.defineTask(LOCATION_TRACKING_TASK, ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];
    if (location) {
      const { latitude, longitude } = location.coords;
      syncLocation(latitude, longitude);
      console.log('Background Sync:', latitude, longitude);
    }
  }
});

class LocationTracker {
  constructor() {
    this.isTracking = false;
    this.foregroundWatcher = null;
  }

  async requestPermissions() {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      this.showSettingsAlert('Foreground location access is required to receive requests.');
      return false;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      this.showSettingsAlert('Always-on location access is required for tracking active deliveries in the background.');
      return false;
    }

    return true;
  }

  showSettingsAlert(message) {
    Alert.alert(
      'Permission Required',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]
    );
  }

  async startTracking() {
    if (this.isTracking) return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    this.isTracking = true;

    // 1. Start Foreground Watcher (High Accuracy)
    this.foregroundWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        timeInterval: 5000,
      },
      (location) => {
        const { latitude, longitude } = location.coords;
        syncLocation(latitude, longitude);
        console.log('Foreground Sync:', latitude, longitude);
      }
    );

    // 2. Start Background Task
    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 20,
      foregroundService: {
        notificationTitle: "Rider Online",
        notificationBody: "Tracking your location for active deliveries",
        notificationColor: "#FF5722",
      },
    });
  }

  async stopTracking() {
    // Stop Background Task
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    }

    // Stop Foreground Watcher
    if (this.foregroundWatcher) {
      this.foregroundWatcher.remove();
      this.foregroundWatcher = null;
    }

    this.isTracking = false;
  }
}

export const locationTracker = new LocationTracker();
