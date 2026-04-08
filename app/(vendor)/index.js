import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Pressable, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useVendorStore } from '../../store/vendorStore';
import { useAuthStore } from '../../store/authStore';
import { socketService } from '../../services/socketService';

import { vendorApi } from '../../services/vendorApi';
import Colors from '../../constants/Colors';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';

const { width } = Dimensions.get('window');
const INCOMING_SLA_SECONDS = 300; // 5 minutes


function ActiveTimer({ acceptedAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!acceptedAt) return;
    const updateTime = () => setElapsed(Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 1000));
    updateTime();
    const timer = setInterval(updateTime, 60000); // update every minute
    return () => clearInterval(timer);
  }, [acceptedAt]);

  const mins = Math.floor(elapsed / 60);
  return <Text style={styles.timeSinceText}>{mins} min ago</Text>;
}

function IncomingOrderModal({ visible, orders, onAccept, onReject }) {
  const order = orders[0]; // Show the oldest pending order
  const [timeLeft, setTimeLeft] = useState(INCOMING_SLA_SECONDS);

  useEffect(() => {
    if (!order) return;
    let elapsed = 0;
    if (order.createdAt) {
      elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 1000);
    }
    const startLeft = Math.max(0, INCOMING_SLA_SECONDS - elapsed);
    setTimeLeft(startLeft);

    if (startLeft === 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [order]);

  if (!order) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isDanger = timeLeft < 60;
  const isBreached = timeLeft === 0;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, isBreached && styles.modalBreached]}>
          <Text style={styles.modalTitle}>New Incoming Order!</Text>
          
          <View style={styles.cardHeader}>
            <Text style={styles.orderId}>Order #{order.id}</Text>
            <View style={[styles.timerBadge, isDanger && styles.timerBadgeDanger]}>
              <Text style={[styles.timerText, isDanger && styles.timerTextDanger]}>
                {isBreached ? 'SLA BREACHED' : `${minutes}:${seconds.toString().padStart(2, '0')} left`}
              </Text>
            </View>
          </View>
          
          <Text style={styles.customerName}>{order.customerName}</Text>
          <Text style={styles.itemsSummary}>
            {order.items?.map(i => `${i.qty}x ${i.name}`).join(', ')}
          </Text>
          <Text style={styles.totalAmount}>${order.total?.toFixed(2)}</Text>

          {isBreached ? (
            <Text style={styles.breachedWarning}>This order has been flagged. Admin notified.</Text>
          ) : (
            <View style={styles.actionRowModal}>
              <TouchableOpacity style={styles.rejectButtonModal} onPress={() => onReject(order.id)}>
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptButtonModal} onPress={() => onAccept(order.id)}>
                <Text style={styles.acceptText}>Accept Order</Text>
              </TouchableOpacity>
            </View>
          )}

          {orders.length > 1 && (
            <Text style={styles.queueText}>+ {orders.length - 1} more in queue</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ActiveOrderCard({ order, router }) {
  // Accepted, Preparing, Ready
  const handleStatusUpdate = async (newStatus) => {
    try {
      if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useVendorStore.getState().moveToHistory(order.id);
        useVendorStore.getState().updateOrder(order.id, { status: newStatus });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await vendorApi.updateOrderStatus(order.id, newStatus);
        useVendorStore.getState().updateOrder(order.id, { status: newStatus });
      }
    } catch (err) {
      Alert.alert('Error', 'Could not update status');
    }

  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/orders/${order.id}`)}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderId}>Order #{order.id}</Text>
        <Text style={styles.statusBadge}>{order.status}</Text>
      </View>
      <Text style={styles.itemsSummary}>
        {order.items?.map(i => `${i.qty}x ${i.name}`).join(', ')}
      </Text>
      
      {order.acceptedAt && <ActiveTimer acceptedAt={order.acceptedAt} />}

      <View style={styles.actionRow}>
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
        {order.status === 'READY_FOR_PICKUP' && (
          <View style={styles.rowBetween}>
            <Text style={styles.waitingText}>Awaiting Rider...</Text>
            {/* Dev Mock to complete the order */}
            <TouchableOpacity style={styles.mockEndButton} onPress={() => handleStatusUpdate('COMPLETED')}>
               <Text style={styles.mockEndText}>[DEV] Rider Picked Up</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function HistoryOrderCard({ order, router }) {
  return (
    <TouchableOpacity style={[styles.card, styles.historyCard]} onPress={() => router.push(`/orders/${order.id}`)}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderId}>Order #{order.id}</Text>
        <Text style={[styles.statusBadge, order.status === 'CANCELLED' && styles.statusBadgeDanger]}>{order.status}</Text>
      </View>
      <Text style={styles.customerName}>{order.customerName}</Text>
      <Text style={styles.itemsSummary}>{order.total?.toFixed(2)} USD</Text>
    </TouchableOpacity>
  );
}

export default function VendorOrdersDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { isOnline, incomingOrders, activeOrders, orderHistory, addIncomingOrder, removeIncomingOrder, addActiveOrder, updateOrder } = useVendorStore();
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' or 'HISTORY'
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const soundRef = useRef(null);


  useEffect(() => {
    if (user?.uid) {
      socketService.connect(user.uid);
      
      const handleNewOrder = async (orderData) => {
        // Step 4: Ignore new orders while offline
        const currentIsOnline = useVendorStore.getState().isOnline;
        if (!currentIsOnline) {
          console.log('Vendor is offline. Ignoring incoming order.');
          return;
        }

        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' }
          );
          soundRef.current = sound;
          await sound.playAsync();
        } catch (error) {
          console.log('Failed to play sound', error);
        }
        addIncomingOrder(orderData);
      };


      const handleOrderUpdate = (data) => {
        if (data.status === 'CANCELLED') {
          useVendorStore.getState().moveToHistory(data.id);
        }
        updateOrder(data.id, { status: data.status });
      };

      socketService.onNewOrder(handleNewOrder);
      socketService.onOrderUpdate(handleOrderUpdate);

      return () => {
        socketService.offNewOrder(handleNewOrder);
        socketService.offOrderUpdate(handleOrderUpdate);
        socketService.disconnect();
        if (soundRef.current) soundRef.current.unloadAsync();
      };
    }
  }, [user]);

  // DEV MOCK: Automatically trigger an order 3 seconds after mounting if online
  useEffect(() => {
    if (!isOnline) return;
    
    // Check if we already have incoming orders so we don't spam it on re-renders
    if (incomingOrders.length === 0 && activeOrders.length === 0) {
      const timer = setTimeout(() => {
        triggerMockOrder();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  const handleAccept = async (orderId) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await vendorApi.acceptOrder(orderId);
      const order = incomingOrders.find(o => o.id === orderId);
      if (order) {
        removeIncomingOrder(orderId);
        addActiveOrder({ ...order, status: 'ACCEPTED', acceptedAt: new Date().toISOString() });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to accept order');
    }
  };

  const handleReject = (orderId) => {
    Alert.alert('Reject Order', 'Are you sure you want to reject this order?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Reject', style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await vendorApi.rejectOrder(orderId, 'Rejected by vendor');
          useVendorStore.getState().moveToHistory(orderId);
          updateOrder(orderId, { status: 'CANCELLED' });
        }
      }
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate data fetch
    setTimeout(() => setRefreshing(false), 2000);
  };


  const triggerMockOrder = () => {
    addIncomingOrder({
      id: Math.floor(1000 + Math.random() * 9000).toString(),
      customerName: 'Mock Customer',
      items: [{ name: 'Chicken Biryani', qty: 2 }, { name: 'Coke', qty: 1 }],
      total: 25.50,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
      deliveryAddress: '123 Fake Street, Appt 4B',
      addons: ['Extra Raita', 'No Onions']
    });
  };

  return (
    <View style={styles.container}>
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You are offline — no new orders will be received.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.devButton} onPress={triggerMockOrder}>
        <Text style={styles.devText}>[DEV MOCK] Trigger Incoming Order</Text>
      </TouchableOpacity>

      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'ACTIVE' && styles.activeTab]} onPress={() => setActiveTab('ACTIVE')}>
          <Text style={[styles.tabText, activeTab === 'ACTIVE' && styles.activeTabText]}>Active ({activeOrders.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'HISTORY' && styles.activeTab]} onPress={() => setActiveTab('HISTORY')}>
          <Text style={[styles.tabText, activeTab === 'HISTORY' && styles.activeTabText]}>History ({orderHistory.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {loading ? (
          [1, 2, 3].map(i => (
            <SkeletonLoader key={i} width={width - 32} height={120} style={{ marginBottom: 16, borderRadius: 12 }} />
          ))
        ) : activeTab === 'ACTIVE' ? (
          activeOrders.length === 0 ? (
            <EmptyState 
              icon="restaurant-outline" 
              title="No active orders" 
              description="New orders will appear here as they come in. Make sure you're online!"
            />
          ) : (
            activeOrders.map(order => <ActiveOrderCard key={order.id} order={order} router={router} />)
          )
        ) : (
          orderHistory.length === 0 ? (
            <EmptyState 
              icon="receipt-outline" 
              title="No history yet" 
              description="Your completed and cancelled orders will be archived here."
            />
          ) : (
            orderHistory.map(order => <HistoryOrderCard key={order.id} order={order} router={router} />)
          )
        )}
      </ScrollView>

      {/* Full Screen Incoming Order Modal */}
      <IncomingOrderModal 
        visible={incomingOrders.length > 0} 
        orders={incomingOrders} 
        onAccept={handleAccept} 
        onReject={handleReject} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grey },
  offlineBanner: { backgroundColor: '#333', padding: 12, alignItems: 'center' },
  offlineText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  devButton: { padding: 10, backgroundColor: Colors.info, alignItems: 'center' },
  devText: { color: 'white', fontWeight: 'bold' },
  
  tabsRow: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, padding: 16, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { color: Colors.subText, fontWeight: '600' },
  activeTabText: { color: Colors.primary, fontWeight: 'bold' },
  
  scrollContent: { padding: 16, paddingBottom: 160 },

  card: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 3, shadowColor: Colors.black, shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 } },
  historyCard: { opacity: 0.8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderId: { fontSize: 16, fontWeight: 'bold', color: Colors.primary },
  customerName: { fontSize: 18, fontWeight: 'bold', color: Colors.black, marginBottom: 4 },
  itemsSummary: { fontSize: 14, color: Colors.subText, marginBottom: 8 },
  
  timerBadge: { backgroundColor: Colors.warning + '30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  timerBadgeDanger: { backgroundColor: Colors.error + '30' },
  timerText: { color: Colors.warning, fontWeight: '700', fontSize: 12 },
  timerTextDanger: { color: Colors.error },
  
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  primaryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, backgroundColor: Colors.primary },
  primaryButtonText: { color: Colors.white, fontWeight: 'bold' },
  successButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, backgroundColor: Colors.success },
  successButtonText: { color: Colors.white, fontWeight: 'bold' },
  statusBadge: { backgroundColor: Colors.grey, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, fontSize: 12, fontWeight: 'bold', color: Colors.subText },
  statusBadgeDanger: { backgroundColor: Colors.error + '30', color: Colors.error },
  
  emptyText: { color: Colors.subText, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  waitingText: { color: Colors.warning, fontWeight: 'bold', fontStyle: 'italic' },
  timeSinceText: { color: Colors.subText, fontSize: 12, fontStyle: 'italic', marginBottom: 8 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  mockEndButton: { padding: 8, borderWidth: 1, borderColor: Colors.info, borderRadius: 4 },
  mockEndText: { color: Colors.info, fontSize: 12, fontWeight: 'bold' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.white, borderRadius: 16, padding: 24, elevation: 10 },
  modalBreached: { borderColor: Colors.error, borderWidth: 2 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.black, marginBottom: 16, textAlign: 'center' },
  totalAmount: { fontSize: 22, fontWeight: 'bold', color: Colors.success, marginBottom: 16 },
  actionRowModal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  rejectButtonModal: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: Colors.error, marginRight: 8, alignItems: 'center' },
  rejectText: { color: Colors.error, fontWeight: 'bold', fontSize: 16 },
  acceptButtonModal: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: Colors.success, marginLeft: 8, alignItems: 'center' },
  acceptText: { color: Colors.white, fontWeight: 'bold', fontSize: 16 },
  breachedWarning: { color: Colors.error, fontWeight: 'bold', marginTop: 8, textAlign: 'center', fontSize: 16 },
  queueText: { textAlign: 'center', marginTop: 16, color: Colors.subText, fontStyle: 'italic' }
});
