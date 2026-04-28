import React from 'react';
import { View, Text, Switch, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useVendorStore } from '../store/vendorStore';
import { vendorApi } from '../services/vendorApi';
import Colors from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { notificationService } from '../services/notificationService';

export default function VendorHeaderToggle() {
  const onlineStatus = useVendorStore((state) => state.onlineStatus);
  const activeOrders = useVendorStore((state) => state.activeOrders);
  const setOnlineStatus = useVendorStore((state) => state.setOnlineStatus);



  const handleToggle = async (newValue) => {
    if (!newValue) {
      // User wants to go offline
      const hasActiveOrders = (activeOrders || []).length > 0;
      
      if (hasActiveOrders) {
        Alert.alert(
          'Active Orders in Progress',
          'You will stop receiving new orders. Complete your current order to go Offline.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Stop New Orders', 
              onPress: () => updateStatus(false) 
            }
          ]
        );
      } else {
        Alert.alert(
          'Go Offline?',
          'You won\'t receive new orders while offline. Continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Go Offline', 
              style: 'destructive',
              onPress: () => updateStatus(false) 
            }
          ]
        );
      }
    } else {
      // User wants to go online
      await updateStatus(true);
    }
  };

  const updateStatus = async (isOnlineRequested) => {
    const previousStatus = onlineStatus;
    // Optimistic UI update
    setOnlineStatus(isOnlineRequested ? 'online' : 'offline');
    
    try {
      const response = await vendorApi.toggleStatus(isOnlineRequested);
      if (response.success) {
        setOnlineStatus(response.status); // This handles 'online', 'offline', or 'stop_new_orders'
        if (response.status === 'stop_new_orders') {
          Alert.alert('Status Updated', response.message);
        }
      }
    } catch (error) {
      // Revert if API fails
      setOnlineStatus(previousStatus);
      const errorMsg = error.response?.data?.error || error.response?.data?.details || error.message;
      Alert.alert('Status Error', errorMsg || 'Failed to change status. Please try again.');
    }
  };

  const getStatusDisplay = () => {
    switch (onlineStatus) {
      case 'online': return { text: 'Online', color: Colors.success, isSwitchOn: true };
      case 'stop_new_orders': return { text: 'Stop New Orders', color: Colors.warning, isSwitchOn: false };
      case 'offline': default: return { text: 'Offline', color: Colors.subText, isSwitchOn: false };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <View style={styles.container}>
      <Text style={[styles.statusText, { color: statusDisplay.color }]}>
        {statusDisplay.text}
      </Text>
      <Switch
        value={statusDisplay.isSwitchOn}
        onValueChange={handleToggle}
        trackColor={{ false: Colors.border, true: Colors.success + '80' }}
        thumbColor={statusDisplay.isSwitchOn ? Colors.success : Colors.subText}
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
  offlineText: {
    color: Colors.subText,
  },

});
