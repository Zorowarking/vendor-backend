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
  offlineText: {
    color: Colors.subText,
  },

});
