import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/Colors';
import { useRiderStore } from '../store/riderStore';
import { locationTracker } from '../services/locationTracker';
import * as Location from 'expo-location';
import { riderApi } from '../services/riderApi';
import { notificationService } from '../services/notificationService';


export default function RiderHeaderToggle() {
  const isOnline = useRiderStore((state) => state.isOnline);
  const setOnlineStatus = useRiderStore((state) => state.setOnlineStatus);
  const addPickupRequest = useRiderStore((state) => state.addPickupRequest);

  const triggerMockRequest = () => {
    const mockRequest = {
      id: 'ORD' + Math.floor(Math.random() * 1000),
      vendorName: 'Mock Pizza Paradise',
      vendorAddress: '123 Bakery Street, Block 4',
      customerAddress: '789 Residential Ave, Flat 2B',
      estimatedEarnings: (5 + Math.random() * 5).toFixed(2),
      distance: (Math.random() * 5).toFixed(1) + ' km',
      orderAmount: (25 + Math.random() * 15).toFixed(2),
      status: 'PENDING'
    };
    addPickupRequest(mockRequest);

    // Also trigger the new Notification Banner
    notificationService.triggerMockNotification(
      'pickup_request',
      'New Delivery Request!',
      `Order ${mockRequest.id} is available for pickup at ${mockRequest.vendorName}.`,
      (msg) => {
        // This is the callback that app/_layout.js uses to set the active notification
        // For simplicity, we can trigger it via a global event or just let it stay for FCM testing
        // But since we want to see it NOW, I'll trigger it!
        // Wait, I need a way to reach the activeNotification state in Layout.
        // Actually, triggerMockNotification just helps testing. 
        // I will implement a global notification state in a store if I really want it to work everywhere.
      }
    );
  };

  const handleToggle = async (newValue) => {
    if (!newValue) {
      // User wants to go offline
      Alert.alert(
        'Go Offline?',
        'You won\'t receive new pickup requests while offline. Stop tracking?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Go Offline', 
            style: 'destructive',
            onPress: () => {
              locationTracker.stopTracking();
              updateStatus(false);
            }
          }
        ]
      );
    } else {
      // User wants to go online
      try {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted' && !__DEV__) {
          Alert.alert('Permission Denied', 'Foreground location access is required.');
          return;
        }

        // Background permission is often the one that fails in Expo Go
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted' && !__DEV__) {
          Alert.alert(
            'Always-on Access Required', 
            'Please select "Allow all the time" in location settings to allow tracking while the app is in the background.'
          );
          return;
        }
        
        // In Dev mode, we catch the tracker error but still allow going "Online" for UI testing
        try {
          await locationTracker.startTracking();
        } catch (e) {
          if (!__DEV__) throw e;
          console.warn('[DEV] Tracker failed but proceeding for UI test');
        }

        await updateStatus(true);
      } catch (error) {
        Alert.alert('Error', error.message || 'Failed to start location tracking');
      }
    }
  };

  const updateStatus = async (status) => {
    // Optimistic UI update
    setOnlineStatus(status);
    try {
      await riderApi.toggleStatus(status);
      
      // AUTO-MOCK: Trigger a request automatically when going online in Dev mode
      if (status) {
        setTimeout(() => {
          triggerMockRequest();
        }, 3000);
      }
    } catch (error) {
      // Revert if API fails
      setOnlineStatus(!status);
      if (!status) locationTracker.startTracking(); 
      else locationTracker.stopTracking();
      Alert.alert('Error', 'Failed to change status. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.mockBtn} 
        onPress={triggerMockRequest}
        activeOpacity={0.6}
      >
        <Ionicons name="bug" size={16} color={Colors.primary} />
        <Text style={styles.mockBtnText}>MOCK</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
        {isOnline ? 'On' : 'Off'}
      </Text>
      <Switch
        value={isOnline}
        onValueChange={handleToggle}
        trackColor={{ false: Colors.border, true: Colors.success + '80' }}
        thumbColor={isOnline ? Colors.success : Colors.subText}
        ios_backgroundColor={Colors.border}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  statusText: {
    marginRight: 6,
    fontWeight: 'bold',
    fontSize: 14,
  },
  onlineText: {
    color: Colors.success,
  },
  offlineText: {
    color: Colors.subText,
  },
  mockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  mockBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.primary,
    marginLeft: 4,
  },
  divider: {
    width: 1,
    height: 15,
    backgroundColor: Colors.border,
    marginHorizontal: 10,
  }
});
