import React from 'react';
import { View, Text, Switch, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useVendorStore } from '../store/vendorStore';
import { vendorApi } from '../services/vendorApi';
import Colors from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { notificationService } from '../services/notificationService';

export default function VendorHeaderToggle() {
  const isOnline = useVendorStore((state) => state.isOnline);
  const activeOrders = useVendorStore((state) => state.activeOrders);
  const setOnlineStatus = useVendorStore((state) => state.setOnlineStatus);

  const triggerMockOrder = () => {
    notificationService.triggerMockNotification(
      'new_order',
      'New Order Received! 🍕',
      'A customer just placed an order for 2x Margherita Pizza. Tap to view.'
    );
  };

  const handleToggle = async (newValue) => {
    if (!newValue) {
      // User wants to go offline
      const hasActiveOrders = activeOrders.length > 0;
      
      const alertTitle = hasActiveOrders ? 'Active Orders in Progress' : 'Go Offline?';
      const alertMsg = hasActiveOrders 
        ? 'You have active orders. Going offline won\'t cancel them but you won\'t receive new ones. Continue?'
        : 'You won\'t receive new orders while offline. Continue?';

      Alert.alert(
        alertTitle,
        alertMsg,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Go Offline', 
            style: 'destructive',
            onPress: () => updateStatus(false) 
          }
        ]
      );
    } else {
      // User wants to go online
      await updateStatus(true);
    }
  };

  const updateStatus = async (status) => {
    // Optimistic UI update
    setOnlineStatus(status);
    try {
      await vendorApi.toggleStatus(status);
    } catch (error) {
      // Revert if API fails
      setOnlineStatus(!status);
      Alert.alert('Error', 'Failed to change status. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.mockBtn} 
        onPress={triggerMockOrder}
        activeOpacity={0.6}
      >
        <Ionicons name="bug" size={16} color={Colors.primary} />
        <Text style={styles.mockBtnText}>MOCK</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
        {isOnline ? 'Online' : 'Offline'}
      </Text>
      <Switch
        value={isOnline}
        onValueChange={handleToggle}
        trackColor={{ false: Colors.border, true: Colors.success + '80' }} // adding slight transparency for track
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
    marginRight: 15,
  },
  statusText: {
    marginRight: 8,
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
    marginHorizontal: 12,
  }
});
