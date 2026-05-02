import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVendorStore } from '../../../store/vendorStore';
import { vendorApi } from '../../../services/vendorApi';
import Colors from '../../../constants/Colors';

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams();
  const router = useRouter();
  
  // Find order in activeOrders usually
  const order = useVendorStore((state) => 
    state.activeOrders.find((o) => o.id === orderId) || 
    state.incomingOrders.find((o) => o.id === orderId) ||
    state.orderHistory.find((o) => o.id === orderId)
  );

  if (!order) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Order not found or has been completed.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFlagged = order.status === 'FLAGGED';

  const handleStatusUpdate = async (newStatus) => {
    try {
      await vendorApi.updateOrderStatus(order.id, newStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useVendorStore.getState().updateOrder(order.id, { status: newStatus });
      router.back();

    } catch (err) {
      Alert.alert('Error', 'Could not update status');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isFlagged && (
        <View style={styles.flaggedBanner}>
          <Text style={styles.flaggedText}>This order has been flagged — Admin has been notified.</Text>
        </View>
      )}

      <View style={styles.headerCard}>
        <View style={styles.row}>
          <Text style={styles.orderIdTitle}>Order #{order.id}</Text>
          <Text style={styles.statusBadge}>{order.status}</Text>
        </View>
        <Text style={styles.customerName}>Customer: {order.customerName}</Text>
        <Text style={styles.timeText}>Created: {new Date(order.createdAt).toLocaleTimeString()}</Text>
        
        {order.status !== 'PENDING' && order.acceptedAt && (
          <Text style={styles.timeTextDark}>Accepted: {new Date(order.acceptedAt).toLocaleTimeString()}</Text>
        )}
        
        {order.deliveryAddress && (
          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>Address (Self-Delivery / Driver Context):</Text>
            <Text style={styles.addressText}>{order.deliveryAddress}</Text>
          </View>
        )}
      </View>

      <View style={styles.itemsCard}>
        <Text style={styles.sectionTitle}>Items</Text>
        {order.items?.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.qty}x</Text>
            <View style={styles.itemDetails}>
              <Text style={styles.itemName}>{item.name}</Text>
              
              {/* Added support for Add-ons display */}
              {order.addons && order.addons.length > 0 && (
                <Text style={styles.addonsText}>Add-ons: + {order.addons.join(', ')}</Text>
              )}

              {item.instructions && (
                <Text style={styles.itemInstructions}>Note: {item.instructions}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Amount</Text>
          <Text style={styles.summaryTotal}>
            ₹{typeof order.total === 'number' ? order.total.toFixed(2) : Number(order.total || 0).toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.actionContainer}>
        {order.status === 'ACCEPTED' && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => handleStatusUpdate('PREPARING')}>
            <Text style={styles.primaryButtonText}>Start Preparing</Text>
          </TouchableOpacity>
        )}

        {order.status === 'PREPARING' && (
          <TouchableOpacity style={styles.successButton} onPress={() => handleStatusUpdate('READY_FOR_PICKUP')}>
            <Text style={styles.successButtonText}>Mark as Ready</Text>
          </TouchableOpacity>
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.grey
  },
  errorText: {
    fontSize: 16, color: Colors.subText, marginBottom: 20
  },
  backButton: {
    padding: 12, backgroundColor: Colors.border, borderRadius: 8
  },
  backButtonText: {
    fontWeight: 'bold', color: Colors.black
  },
  container: {
    padding: 16, backgroundColor: Colors.grey, flexGrow: 1, paddingBottom: 160
  },

  flaggedBanner: {
    backgroundColor: Colors.error + '20',
    borderColor: Colors.error,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  flaggedText: {
    color: Colors.error,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  headerCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8
  },
  orderIdTitle: {
    fontSize: 22, fontWeight: 'bold', color: Colors.primary
  },
  statusBadge: {
    backgroundColor: Colors.grey, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, fontWeight: 'bold', fontSize: 12
  },
  customerName: {
    fontSize: 16, color: Colors.black, marginBottom: 4
  },
  timeText: {
    fontSize: 14, color: Colors.subText, marginBottom: 4
  },
  timeTextDark: {
     fontSize: 14, color: Colors.black, fontWeight: 'bold', marginBottom: 4
  },
  addressBox: {
    marginTop: 12, padding: 10, backgroundColor: Colors.grey, borderRadius: 6
  },
  addressLabel: {
    fontSize: 12, color: Colors.subText, fontStyle: 'italic', marginBottom: 2
  },
  addressText: {
    fontSize: 14, color: Colors.black, fontWeight: '500'
  },
  itemsCard: {
    backgroundColor: Colors.white, padding: 16, borderRadius: 12, marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18, fontWeight: 'bold', color: Colors.black, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8
  },
  itemRow: {
    flexDirection: 'row', marginBottom: 12
  },
  itemQty: {
    fontSize: 16, fontWeight: 'bold', color: Colors.primary, width: 30
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 16, color: Colors.text, fontWeight: '500'
  },
  addonsText: {
    fontSize: 13, color: Colors.primary, marginTop: 4, fontWeight: '500'
  },
  itemInstructions: {
    fontSize: 12, color: Colors.warning, fontStyle: 'italic', marginTop: 4
  },
  summaryCard: {
    backgroundColor: Colors.white, padding: 16, borderRadius: 12, marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  summaryLabel: {
    fontSize: 16, color: Colors.black
  },
  summaryTotal: {
    fontSize: 22, fontWeight: 'bold', color: Colors.success
  },
  actionContainer: {
    marginTop: 'auto'
  },
  primaryButton: {
    backgroundColor: Colors.primary, padding: 16, borderRadius: 8, alignItems: 'center'
  },
  primaryButtonText: {
    color: Colors.white, fontSize: 18, fontWeight: 'bold'
  },
  successButton: {
    backgroundColor: Colors.success, padding: 16, borderRadius: 8, alignItems: 'center'
  },
  successButtonText: {
    color: Colors.white, fontSize: 18, fontWeight: 'bold'
  }
});
