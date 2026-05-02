import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Pressable, RefreshControl, Dimensions, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';


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
const INCOMING_SLA_SECONDS = 60; // 1 minute (for testing)

const checkOperatingHours = (hoursRange) => {
  if (!hoursRange) return true; // Default to open if not set
  try {
    const [startStr, endStr] = hoursRange.split(' - ');
    const now = new Date();
    
    const parseTime = (timeStr) => {
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':');
      if (hours === '12') hours = '00';
      if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
      const d = new Date();
      d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
      return d;
    };

    const startTime = parseTime(startStr);
    const endTime = parseTime(endStr);
    
    // Handle overnight shifts (e.g., 10 PM - 2 AM)
    if (endTime < startTime) {
      return now >= startTime || now <= endTime;
    }
    return now >= startTime && now <= endTime;
  } catch (e) {
    return true; // Fallback to avoid blocking orders on parse error
  }
};


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

function PrepTimer({ startTime }) {
  const [timeLeft, setTimeLeft] = useState(60); // 1 minute (for testing)

  useEffect(() => {
    if (!startTime) return;
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      setTimeLeft(Math.max(0, 60 - elapsed));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isOver = timeLeft === 0;

  return (
    <View style={[styles.timerBadge, isOver && styles.timerBadgeDanger, { alignSelf: 'flex-start', marginBottom: 8 }]}>
      <Text style={[styles.timerText, isOver && styles.timerTextDanger]}>
        {isOver ? 'PREPARATION DELAYED' : `Prep Time: ${mins}:${secs.toString().padStart(2, '0')} left`}
      </Text>
    </View>
  );
}

function IncomingOrderModal({ visible, orders, onAccept, onReject, onDismiss, isOutsideHours }) {
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
           <TouchableOpacity style={styles.closeModalBtn} onPress={() => onDismiss(order.id)}>
             <Ionicons name="close" size={24} color={Colors.subText} />
           </TouchableOpacity>
           <TouchableOpacity style={styles.minimizeModalBtn} onPress={() => onDismiss(order.id)}>
             <Ionicons name="contract" size={24} color={Colors.primary} />
           </TouchableOpacity>
           <Text style={styles.modalTitle}>New Incoming Order!</Text>
          
          {isOutsideHours && (
            <View style={styles.outsideHoursBadge}>
              <Ionicons name="moon" size={12} color="#856404" />
              <Text style={styles.outsideHoursText}>Received outside operating hours</Text>
            </View>
          )}

          <View style={styles.cardHeader}>
            <Text style={styles.orderId}>Order #{order.id.substring(0, 8)}</Text>
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
          <Text style={styles.totalAmount}>
            ₹{typeof order.total === 'number' ? order.total.toFixed(2) : Number(order.total || 0).toFixed(2)}
          </Text>

          {isBreached ? (
            <View>
              <Text style={styles.breachedWarning}>This order has been flagged. Admin notified.</Text>
              <TouchableOpacity 
                style={[styles.primaryButton, { marginTop: 20, alignSelf: 'center', width: '100%' }]} 
                onPress={() => onDismiss(order.id)}
              >
                <Text style={styles.primaryButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
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

const REJECTION_REASONS = [
  'Store closed',
  'Kitchen closed',
  'Item(s) unavailable',
  'Unable to fulfill order',
  'Staff unavailable',
  'Technical issue',
  'Other'
];

function RejectionReasonModal({ visible, onCancel, onConfirm }) {
  const [selectedReason, setSelectedReason] = useState(null);
  const [otherText, setOtherText] = useState('');

  const canConfirm = selectedReason && (selectedReason !== 'Other' || otherText.trim().length > 0);

  const handleConfirm = () => {
    if (!canConfirm) return;
    const finalReason = selectedReason === 'Other' ? `Other: ${otherText}` : selectedReason;
    onConfirm(finalReason);
    setSelectedReason(null);
    setOtherText('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.rejectionContent}>
          <Text style={styles.rejectionTitle}>Reject Order</Text>
          <Text style={styles.rejectionSub}>Please select a mandatory reason to reject this order.</Text>
          
          <ScrollView style={{ maxHeight: 300 }}>
            {REJECTION_REASONS.map(reason => (
              <TouchableOpacity 
                key={reason} 
                style={[styles.reasonItem, selectedReason === reason && styles.reasonItemActive]}
                onPress={() => setSelectedReason(reason)}
              >
                <View style={[styles.radio, selectedReason === reason && styles.radioActive]}>
                  {selectedReason === reason && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextActive]}>
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedReason === 'Other' && (
            <View style={styles.otherInputContainer}>
              <Text style={styles.otherLabel}>Please specify *</Text>
              <TextInput 
                style={styles.otherInput} 
                placeholder="Enter reason..." 
                value={otherText}
                onChangeText={setOtherText}
                multiline
              />
            </View>
          )}

          <View style={styles.actionRowModal}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmRejectBtn, !canConfirm && styles.disabledBtn]} 
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmRejectBtnText}>Confirm Rejection</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CommissionSelectionModal({ visible, onSelect, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.commissionSelectionContent}>
          <View style={styles.commissionHeader}>
            <View style={styles.commissionIconBg}>
              <Ionicons name="calculator" size={28} color={Colors.white} />
            </View>
            <Text style={styles.commissionModalTitle}>Business Configuration</Text>
            <Text style={styles.commissionModalSub}>Choose your platform commission model to continue. This setting is permanent.</Text>
          </View>

          <TouchableOpacity 
            style={styles.modelOption} 
            onPress={() => onSelect('ADD_ON')}
            disabled={loading}
          >
            <View style={styles.modelHeader}>
              <View style={styles.modelIcon}>
                <Ionicons name="add-circle" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modelName}>Add-on Model</Text>
                <Text style={styles.modelPrice}>5% added to price</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.border} />
            </View>
            <Text style={styles.modelDescription}>
              The platform fee is added on top of your product price. You receive exactly what you charge, and the customer pays the difference.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.modelOption} 
            onSelect={() => onSelect('DEDUCTED')} // Wait, typo in my thought? onPress
            onPress={() => onSelect('DEDUCTED')}
            disabled={loading}
          >
            <View style={styles.modelHeader}>
              <View style={[styles.modelIcon, { backgroundColor: Colors.success + '15' }]}>
                <Ionicons name="remove-circle" size={24} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modelName}>Deducted Model</Text>
                <Text style={styles.modelPrice}>5% deducted from price</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.border} />
            </View>
            <Text style={styles.modelDescription}>
              The platform fee is taken from your product price. Customers see your exact price, and the platform takes a 5% cut from the sale.
            </Text>
          </TouchableOpacity>

          {loading && (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 10 }} />
          )}

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.subText} />
            <Text style={styles.infoBoxText}>You cannot change this later. Please choose carefully.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActiveOrderCard({ order, router }) {
  // Accepted, Preparing, Ready
  const handleStatusUpdate = async (newStatus) => {
    try {
      if (newStatus === 'delivered' || newStatus === 'cancelled_by_vendor') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useVendorStore.getState().moveToHistory(order.id);
        useVendorStore.getState().updateOrder(order.id, { status: newStatus });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const res = await vendorApi.updateOrderStatus(order.id, newStatus);
        if (res.success && res.order) {
          useVendorStore.getState().updateOrder(order.id, { 
            ...res.order,
            // Preserve fields that might be missing in simplified response
            customerName: order.customerName,
            items: order.items,
            total: order.total
          });
        } else {
          useVendorStore.getState().updateOrder(order.id, { status: newStatus });
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Could not update status');
    }

  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/orders/${order.id}`)}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.orderId}>Order #{order.id.substring(0, 8)}</Text>
          {(order.isFlagged || order.isFlaggedAdmin) && (
            <View style={styles.flaggedBadge}>
              <Ionicons name="flag" size={10} color={Colors.white} />
              <Text style={styles.flaggedText}>FLAGGED</Text>
            </View>
          )}
        </View>
        <Text style={styles.statusBadge}>{order.status}</Text>
      </View>
      <Text style={styles.itemsSummary}>
        {order.items?.map(i => `${i.qty}x ${i.name}`).join(', ')}
      </Text>
      
      {order.acceptedAt && <ActiveTimer acceptedAt={order.acceptedAt} />}
      {order.status === 'preparing' && order.preparingAt && <PrepTimer startTime={order.preparingAt} />}

      <View style={styles.actionRow}>
        {order.status === 'accepted' && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => handleStatusUpdate('preparing')}>
            <Text style={styles.primaryButtonText}>Start Preparing</Text>
          </TouchableOpacity>
        )}
        {order.status === 'preparing' && (
          <TouchableOpacity style={styles.successButton} onPress={() => handleStatusUpdate('ready_for_pickup')}>
            <Text style={styles.successButtonText}>Mark as Ready</Text>
          </TouchableOpacity>
        )}
        {order.status === 'ready_for_pickup' && (
          <View style={styles.rowBetween}>
            <Text style={styles.waitingText}>Awaiting Rider...</Text>
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
        <Text style={[styles.orderId, { fontSize: 12 }]}>Order #{order.id.substring(0, 8)}</Text>
      </View>
      <Text style={styles.customerName}>{order.customerName}</Text>
        <Text style={styles.historyTotal}>
          ₹{typeof order.total === 'number' ? order.total.toFixed(2) : Number(order.total || 0).toFixed(2)}
        </Text>
      
      <View style={styles.badgeRow}>
        <Text style={[
          styles.statusBadge, 
          (order.status?.toLowerCase() === 'cancelled_by_vendor' || order.status?.toLowerCase() === 'cancelled') && styles.statusBadgeDanger
        ]}>
          {order.status}
        </Text>
        {(order.isFlagged || order.isFlaggedAdmin) && (
          <View style={[styles.flaggedBadge, { marginLeft: 8 }]}>
            <Ionicons name="flag" size={10} color={Colors.white} />
            <Text style={styles.flaggedText}>FLAGGED</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function VendorOrdersDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { onlineStatus, incomingOrders, activeOrders, orderHistory, addIncomingOrder, removeIncomingOrder, addActiveOrder, updateOrder } = useVendorStore();
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' or 'HISTORY'
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [rejectOrderId, setRejectOrderId] = useState(null);
  const [updatingCommission, setUpdatingCommission] = useState(false);
  const soundRef = useRef(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await vendorApi.getProfile();
      setProfile(data);
      fetchOrders(); // Fetch orders after profile
    } catch (e) {
      console.error('Failed to fetch profile in dashboard');
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await vendorApi.getOrders();
      useVendorStore.getState().setOrders(data.active, data.history);
    } catch (e) {
      console.error('Failed to fetch orders:', e.response?.data?.details || e.message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (user?.uid && profile?.id) {
      socketService.connect(profile.id);
      
      const handleNewOrder = async (orderData) => {
        // Step 4: Ignore new orders while offline
        const currentStatus = useVendorStore.getState().onlineStatus;
        if (currentStatus === 'offline') {
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
        if (data.status === 'cancelled_by_vendor' || data.status === 'delivered') {
          useVendorStore.getState().moveToHistory(data.id);
        }
        updateOrder(data.id, { status: data.status });
      };

      socketService.onNewOrder(handleNewOrder);
      socketService.onOrderUpdate(handleOrderUpdate);

      return () => {
        socketService.offNewOrder(handleNewOrder);
        socketService.offOrderUpdate(handleOrderUpdate);
        // Do not disconnect here if we want to stay connected between tab switches 
        // but here it's fine as it's the main screen
        socketService.disconnect();
        if (soundRef.current) soundRef.current.unloadAsync();
      };
    }
  }, [user, profile?.id]);



  const handleDismiss = (orderId) => {
    removeIncomingOrder(orderId);
  };

  const handleAccept = async (orderId) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await vendorApi.acceptOrder(orderId);
      const order = incomingOrders.find(o => o.id === orderId);
      if (order) {
        removeIncomingOrder(orderId);
        addActiveOrder({ ...order, status: 'accepted', acceptedAt: new Date().toISOString() });
      }
    } catch (e) {
      const errorMsg = e.response?.data?.error || 'Failed to accept order';
      if (errorMsg.includes('already processed')) {
        Alert.alert('Notice', 'This order has already been processed or cancelled due to timeout.');
        removeIncomingOrder(orderId);
      } else {
        Alert.alert('Error', errorMsg);
      }
    }
  };

  const handleReject = (orderId) => {
    setRejectOrderId(orderId);
  };

  const confirmRejection = async (reason) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await vendorApi.rejectOrder(rejectOrderId, reason);
      useVendorStore.getState().moveToHistory(rejectOrderId);
      updateOrder(rejectOrderId, { status: 'cancelled_by_vendor' });
      setRejectOrderId(null);
    } catch (e) {
      const errorMsg = e.response?.data?.error || 'Failed to reject order';
      
      // If order not found, it might be a mock or already deleted. Remove from UI.
      if (e.response?.status === 404) {
        useVendorStore.getState().removeIncomingOrder(rejectOrderId);
        setRejectOrderId(null);
        return;
      }
      
      Alert.alert('Error', errorMsg);
    }
  };

  const handleCommissionSelect = async (model) => {
    try {
      setUpdatingCommission(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await vendorApi.updateProfile({ ...profile, commissionModel: model });
      await fetchProfile(); // Refresh profile to hide modal
      Alert.alert('Success', 'Commission model set successfully! You can now start receiving orders.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to set commission model');
    } finally {
      setUpdatingCommission(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProfile(), fetchOrders()]);
    setRefreshing(false);
  };




  return (
    <View style={styles.container}>
      {onlineStatus !== 'online' && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You are offline — no new orders will be received.</Text>
        </View>
      )}

      {profile && profile.commissionModel === null && (
        <View style={styles.setupBanner}>
          <View style={styles.setupIcon}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.setupTitle}>Configuration Required</Text>
            <Text style={styles.setupSub}>Please select your commission model below to proceed.</Text>
          </View>
        </View>
      )}

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
        onDismiss={handleDismiss}
        isOutsideHours={profile ? !checkOperatingHours(profile.operatingHours) : false}
      />

      <RejectionReasonModal 
        visible={!!rejectOrderId}
        onCancel={() => setRejectOrderId(null)}
        onConfirm={confirmRejection}
      />

      <CommissionSelectionModal 
        visible={profile !== null && profile.commissionModel === null}
        onSelect={handleCommissionSelect}
        loading={updatingCommission}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grey },
  offlineBanner: { backgroundColor: '#333', padding: 12, alignItems: 'center' },
  offlineText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  
  tabsRow: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, padding: 16, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { color: Colors.subText, fontWeight: '600' },
  activeTabText: { color: Colors.primary, fontWeight: 'bold' },
  
  scrollContent: { padding: 16, paddingBottom: 160 },

  card: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 3, shadowColor: Colors.black, shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 } },
  historyCard: { opacity: 0.8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  flaggedBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.error, 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4, 
    marginLeft: 8 
  },
  flaggedText: { 
    color: Colors.white, 
    fontSize: 9, 
    fontWeight: 'bold', 
    marginLeft: 3 
  },
  orderId: { fontSize: 16, fontWeight: 'bold', color: Colors.primary },
  customerName: { fontSize: 18, fontWeight: 'bold', color: Colors.black, marginBottom: 4 },
  itemsSummary: { fontSize: 14, color: Colors.subText, marginBottom: 8 },
  
  timerBadge: { backgroundColor: Colors.warning + '30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  timerBadgeDanger: { backgroundColor: Colors.error + '30' },
  timerText: { color: Colors.warning, fontWeight: '700', fontSize: 12 },
  timerTextDanger: { color: Colors.error },
  
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  
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

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.white, borderRadius: 16, padding: 24, elevation: 10 },
  modalBreached: { borderColor: Colors.error, borderWidth: 2 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.black, marginBottom: 16, textAlign: 'center' },
  closeModalBtn: { position: 'absolute', right: 16, top: 16, zIndex: 10, padding: 4 },
  minimizeModalBtn: { position: 'absolute', left: 16, top: 16, zIndex: 10, padding: 4 },
  totalAmount: { fontSize: 22, fontWeight: 'bold', color: Colors.success, marginBottom: 16 },
  actionRowModal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  rejectButtonModal: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: Colors.error, marginRight: 8, alignItems: 'center' },
  rejectText: { color: Colors.error, fontWeight: 'bold', fontSize: 16 },
  acceptButtonModal: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: Colors.success, marginLeft: 8, alignItems: 'center' },
  acceptText: { color: Colors.white, fontWeight: 'bold', fontSize: 16 },
  breachedWarning: { color: Colors.error, fontSize: 13, textAlign: 'center', marginTop: 10, fontWeight: 'bold' },
  
  outsideHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ffeeba',
  },
  outsideHoursText: {
    color: '#856404',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 6,
  },

  rejectionContent: {
    backgroundColor: Colors.white,
    padding: 24,
    borderRadius: 24,
    width: width * 0.9,
    maxHeight: '80%',
  },
  rejectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  rejectionSub: {
    fontSize: 14,
    color: Colors.subText,
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.grey,
  },
  reasonItemActive: {
    backgroundColor: Colors.primary + '08',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioActive: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  reasonText: {
    fontSize: 16,
    color: Colors.black,
  },
  reasonTextActive: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  otherInputContainer: {
    marginTop: 16,
    marginBottom: 10,
  },
  otherLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.subText,
    marginBottom: 6,
  },
  otherInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: Colors.grey,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelBtnText: {
    color: Colors.darkGrey,
    fontWeight: 'bold',
    fontSize: 16,
  },
  confirmRejectBtn: {
    flex: 2,
    backgroundColor: Colors.error,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmRejectBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  queueText: { textAlign: 'center', marginTop: 16, color: Colors.subText, fontStyle: 'italic' },
  
  // Setup Banner Styles
  setupBanner: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  setupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  setupTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  setupSub: {
    color: Colors.white,
    fontSize: 12,
    opacity: 0.9,
  },
  
  // Commission Selection Modal Styles
  commissionSelectionContent: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    width: width * 0.9,
    maxWidth: 400,
  },
  commissionHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  commissionIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  commissionModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
    textAlign: 'center',
  },
  commissionModalSub: {
    fontSize: 14,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 20,
  },
  modelOption: {
    backgroundColor: Colors.grey,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modelIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
  },
  modelPrice: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  modelDescription: {
    fontSize: 13,
    color: Colors.subText,
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.grey,
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  infoBoxText: {
    fontSize: 12,
    color: Colors.subText,
    marginLeft: 8,
    fontStyle: 'italic',
  }
});
