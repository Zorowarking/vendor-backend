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
const INCOMING_SLA_SECONDS = 300; // 5 minutes as per MVP Requirements

const checkOperatingHours = (operatingHours) => {
  if (!operatingHours || typeof operatingHours !== 'object') return true;
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const todayHours = operatingHours[dayName];

    if (!todayHours || todayHours.isClosed) return false;

    const [openH, openM] = todayHours.open.split(':').map(Number);
    const [closeH, closeM] = todayHours.close.split(':').map(Number);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;

    if (closeMins < openMins) {
      return currentMins >= openMins || currentMins <= closeMins;
    }
    return currentMins >= openMins && currentMins <= closeMins;
  } catch (e) {
    return true;
  }
};


const ActiveTimer = React.memo(({ acceptedAt }) => {
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
});

const SlaTimer = React.memo(({ createdAt }) => {
  const [timeLeft, setTimeLeft] = useState(INCOMING_SLA_SECONDS);

  useEffect(() => {
    if (!createdAt) return;
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      setTimeLeft(Math.max(0, INCOMING_SLA_SECONDS - elapsed));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isOver = timeLeft === 0;

  return (
    <View style={[styles.timerBadge, isOver && styles.timerBadgeDanger, { alignSelf: 'flex-start', marginBottom: 8 }]}>
      <Text style={[styles.timerText, isOver && styles.timerTextDanger]}>
        {isOver ? 'SLA BREACHED' : `Acceptance: ${mins}:${secs.toString().padStart(2, '0')} left`}
      </Text>
    </View>
  );
});

const PrepTimer = React.memo(({ startTime }) => {
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
});

function IncomingOrderModal({ visible, orders, onAccept, onReject, onDismiss, isOutsideHours, onContactSupport }) {
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
            <View>
              <Text style={styles.orderId}>Order #{order.id.substring(0, 8)}</Text>
              {order.paymentMethod?.startsWith('Sandbox') && (
                <View style={styles.sandboxBadge}>
                  <Text style={styles.sandboxText}>SANDBOX TEST</Text>
                </View>
              )}
            </View>
            <View style={[styles.timerBadge, isDanger && styles.timerBadgeDanger]}>
              <Text style={[styles.timerText, isDanger && styles.timerTextDanger]}>
                {isBreached ? 'SLA BREACHED' : `${minutes}:${seconds.toString().padStart(2, '0')} left`}
              </Text>
            </View>
          </View>
          
          <Text style={styles.customerName}>{order.customer?.fullName || order.customerName || 'Valued Customer'}</Text>
          <Text style={styles.itemsSummary}>
            {order.items?.map(i => `${i.qty}x ${i.name || 'Unknown Item'}`).join(', ') || 'No items listed'}
          </Text>
          <Text style={styles.totalAmount}>
            ₹{typeof order.total === 'number' ? order.total.toFixed(2) : Number(order.total || 0).toFixed(2)}
          </Text>

          {isBreached && (
            <View style={styles.breachedWarningContainer}>
              <Ionicons name="warning" size={16} color="#856404" />
              <Text style={styles.breachedWarning}>SLA Breached. This order is now flagged for Admin review.</Text>
            </View>
          )}

          <View style={styles.actionRowModal}>
            {!isOutsideHours ? (
              <TouchableOpacity 
                style={[styles.rejectButtonModal, { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2', borderWidth: 1 }]} 
                onPress={() => onContactSupport(order.id)}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color="#E65100" style={{ marginBottom: 4 }} />
                <Text style={[styles.rejectText, { color: '#E65100', fontSize: 13 }]}>Support</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.rejectButtonModal} onPress={() => onReject(order.id)}>
                <Ionicons name="close-circle" size={18} color={Colors.error} style={{ marginBottom: 4 }} />
                <Text style={[styles.rejectText, { fontSize: 13 }]}>Reject</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.acceptButtonModal} onPress={() => onAccept(order.id)}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.white} style={{ marginBottom: 2 }} />
              <Text style={styles.acceptText}>Accept Order</Text>
            </TouchableOpacity>
          </View>

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
  ' Kitchen closed',
  'Item(s) unavailable',
  'Unable to fulfill order',
  'Staff unavailable',
  'Technical issue',
  'Other'
];

const SUPPORT_REASONS = [
  'Item out of stock',
  'Store temporarily busy',
  'Technical issue',
  'Unable to prepare within time',
  'Pricing issue',
  'Store closing early',
  'Other'
];

function SupportReasonModal({ visible, onCancel, onConfirm }) {
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
          <View style={styles.supportHeaderRow}>
            <Ionicons name="chatbubble-ellipses" size={24} color="#E65100" />
            <Text style={[styles.rejectionTitle, { marginLeft: 10, marginBottom: 0 }]}>Contact Support</Text>
          </View>
          <Text style={styles.rejectionSub}>Select a reason why you're having trouble with this order. Admin will be notified.</Text>
          
          <ScrollView style={{ maxHeight: 300 }}>
            {SUPPORT_REASONS.map(reason => (
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
                placeholder="Enter details..." 
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
              style={[styles.confirmRejectBtn, { backgroundColor: '#E65100' }, !canConfirm && styles.disabledBtn]} 
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={styles.confirmRejectBtnText}>Notify Support</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}


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



const ActiveOrderCard = React.memo(({ order, router }) => {
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
          <View style={styles.badgeContainer}>
            {order.paymentMethod?.startsWith('Sandbox') && (
              <View style={styles.sandboxBadge}>
                <Text style={styles.sandboxText}>SANDBOX</Text>
              </View>
            )}
            {(order.isFlagged || order.isFlaggedAdmin) && (
              <View style={styles.flaggedBadge}>
                <Ionicons name="flag" size={10} color={Colors.white} />
                <Text style={styles.flaggedText}>FLAGGED</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.statusBadge, order.status === 'ready_for_pickup' && styles.statusBadgeSuccess]} numberOfLines={1}>
            {order.status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>
      <Text style={styles.itemsSummary} numberOfLines={2}>
        {order.items?.map(i => `${i.qty}x ${i.name || 'Item'}`).join(', ') || 'No items'}
      </Text>
      
      {order.acceptedAt && <ActiveTimer acceptedAt={order.acceptedAt} />}
      {(order.status === 'pending_vendor' || order.status === 'pending_vendor_response') && (
        <SlaTimer createdAt={order.createdAt} />
      )}
      {order.status === 'preparing' && order.preparingAt && <PrepTimer startTime={order.preparingAt} />}

      <View style={styles.actionRow}>
        {(order.status === 'accepted' || order.status === 'pending_vendor_response') && (
          <TouchableOpacity 
            style={[styles.primaryButton, order.status === 'pending_vendor_response' && { backgroundColor: Colors.success }]} 
            onPress={() => handleStatusUpdate(order.status === 'pending_vendor_response' ? 'accepted' : 'preparing')}
          >
            <Text style={styles.primaryButtonText}>
              {order.status === 'pending_vendor_response' ? 'Accept Order' : 'Start Preparing'}
            </Text>
          </TouchableOpacity>
        )}
        {order.status === 'preparing' && (
          <TouchableOpacity style={styles.successButton} onPress={() => handleStatusUpdate('ready_for_pickup')}>
            <Text style={styles.successButtonText}>Mark as Ready</Text>
          </TouchableOpacity>
        )}
        {order.status === 'ready_for_pickup' && (
          <View style={styles.rowBetween}>
            <Text style={styles.waitingText}>Awaiting for delivery...</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const HistoryOrderCard = React.memo(({ order, router }) => {
  return (
    <TouchableOpacity style={[styles.card, styles.historyCard]} onPress={() => router.push(`/orders/${order.id}`)}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={[styles.orderId, { fontSize: 12 }]}>Order #{order.id.substring(0, 8)}</Text>
        </View>
        <Text style={styles.historyTotal}>
          ₹{typeof order.total === 'number' ? order.total.toFixed(2) : Number(order.total || 0).toFixed(2)}
        </Text>
      </View>
      <Text style={styles.customerName}>{order.customerName}</Text>
      
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
});

export default function VendorOrdersDashboard() {
  const router = useRouter();
  const userUid = useAuthStore(state => state.user?.uid);
  
  const onlineStatus = useVendorStore(state => state.onlineStatus);
  const incomingOrders = useVendorStore(state => state.incomingOrders);
  const activeOrders = useVendorStore(state => state.activeOrders);
  const orderHistory = useVendorStore(state => state.orderHistory);
  
  const addIncomingOrder = useVendorStore(state => state.addIncomingOrder);
  const removeIncomingOrder = useVendorStore(state => state.removeIncomingOrder);
  const addActiveOrder = useVendorStore(state => state.addActiveOrder);
  const updateOrder = useVendorStore(state => state.updateOrder);

  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' or 'HISTORY'
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [rejectOrderId, setRejectOrderId] = useState(null);
  const [supportOrderId, setSupportOrderId] = useState(null);
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
    if (userUid && profile?.id) {
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
        
        // Track unread activity for background notifications
        if (useVendorStore.getState().appState !== 'active') {
          useVendorStore.getState().setHasUnreadActivity(true);
        }
      };


      const handleOrderUpdate = (data) => {
        if (data.status === 'cancelled_by_vendor' || data.status === 'delivered') {
          useVendorStore.getState().moveToHistory(data.id);
        }
        updateOrder(data.id, { status: data.status });
        
        // Track unread activity for background notifications
        if (useVendorStore.getState().appState !== 'active') {
          useVendorStore.getState().setHasUnreadActivity(true);
        }
      };

      socketService.onNewOrder(handleNewOrder);
      socketService.onOrderUpdate(handleOrderUpdate);

      return () => {
        socketService.offNewOrder(handleNewOrder);
        socketService.offOrderUpdate(handleOrderUpdate);
        // Do not disconnect socket here, let app/_layout handle global connection lifecycle
        if (soundRef.current) soundRef.current.unloadAsync();
      };
    }
  }, [userUid, profile?.id]);



  const handleDismiss = (orderId) => {
    removeIncomingOrder(orderId);
  };

  const handleAccept = async (orderId) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // 1. Optimistic Update
    const order = incomingOrders.find(o => o.id === orderId);
    if (order) {
      removeIncomingOrder(orderId);
      addActiveOrder({ ...order, status: 'accepted', acceptedAt: new Date().toISOString() });
    }

    try {
      await vendorApi.acceptOrder(orderId);
    } catch (e) {
      // Rollback if failed (re-fetch orders or manually put it back)
      const errorMsg = e.response?.data?.error || 'Failed to accept order';
      if (errorMsg.includes('already processed')) {
        // Just refresh if it's already gone
        fetchOrders();
      } else {
        Alert.alert('Error', errorMsg);
        fetchOrders();
      }
    }
  };

  const handleReject = (orderId) => {
    setRejectOrderId(orderId);
  };

  const handleContactSupport = (orderId) => {
    setSupportOrderId(orderId);
  };

  const confirmSupport = async (reason) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const order = incomingOrders.find(o => o.id === supportOrderId);
      if (order) {
        removeIncomingOrder(supportOrderId);
        addActiveOrder({ 
          ...order, 
          status: 'pending_vendor_response', 
          isFlagged: true, 
          flagReason: reason 
        });
      }

      await vendorApi.contactSupport(supportOrderId, reason);
      
      Alert.alert(
        'Support Notified', 
        'We have alerted the admin team. The order will remain in your dashboard while support reviews the issue.',
        [{ text: 'OK' }]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to reach support. Please try again.');
      fetchOrders();
    } finally {
      setSupportOrderId(null);
    }
  };

  const confirmRejection = async (reason) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      // Optimistic
      useVendorStore.getState().moveToHistory(rejectOrderId);
      updateOrder(rejectOrderId, { status: 'cancelled_by_vendor' });
      
      await vendorApi.rejectOrder(rejectOrderId, reason);
      setRejectOrderId(null);
    } catch (e) {
      const errorMsg = e.response?.data?.error || 'Failed to reject order';
      Alert.alert('Error', errorMsg);
      fetchOrders();
      setRejectOrderId(null);
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProfile(), fetchOrders()]);
    setRefreshing(false);
  }, []);

  const renderItem = React.useCallback(({ item }) => {
    if (activeTab === 'ACTIVE') {
      return <ActiveOrderCard order={item} router={router} />;
    }
    return <HistoryOrderCard order={item} router={router} />;
  }, [activeTab, router]);

  return (
    <View style={styles.container}>
      {onlineStatus !== 'online' && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You are offline — no new orders will be received.</Text>
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

      <FlatList 
        data={activeTab === 'ACTIVE' ? activeOrders : orderHistory}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderItem}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 16 }}>
              {[1, 2, 3].map(i => (
                <SkeletonLoader key={i} width={width - 32} height={120} style={{ marginBottom: 16, borderRadius: 12 }} />
              ))}
            </View>
          ) : activeTab === 'ACTIVE' ? (
            <EmptyState 
              icon="restaurant-outline" 
              title="No active orders" 
              description="New orders will appear here as they come in. Make sure you're online!"
            />
          ) : (
            <EmptyState 
              icon="receipt-outline" 
              title="No history yet" 
              description="Your completed and cancelled orders will be archived here."
            />
          )
        }
      />

      {/* Full Screen Incoming Order Modal */}
      <IncomingOrderModal 
        visible={incomingOrders.length > 0} 
        orders={incomingOrders} 
        onAccept={handleAccept} 
        onReject={handleReject}
        onDismiss={handleDismiss}
        onContactSupport={handleContactSupport}
        isOutsideHours={profile ? !checkOperatingHours(profile.operatingHours) : false}
      />

      <RejectionReasonModal 
        visible={!!rejectOrderId}
        onCancel={() => setRejectOrderId(null)}
        onConfirm={confirmRejection}
      />

      <SupportReasonModal 
        visible={!!supportOrderId}
        onCancel={() => setSupportOrderId(null)}
        onConfirm={confirmSupport}
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLeft: { flex: 1, marginRight: 8 },
  headerRight: { alignItems: 'flex-end', maxWidth: '40%' },
  badgeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },

  flaggedBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.error, 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4,
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
  statusBadge: { backgroundColor: Colors.grey, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, fontSize: 11, fontWeight: 'bold', color: Colors.subText, textTransform: 'uppercase' },
  statusBadgeSuccess: { backgroundColor: Colors.success + '15', color: Colors.success },
  statusBadgeDanger: { backgroundColor: Colors.error + '15', color: Colors.error },
  statusBadgeDanger: { backgroundColor: Colors.error + '30', color: Colors.error },
  
  emptyText: { color: Colors.subText, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  waitingText: { color: Colors.warning, fontWeight: 'bold', fontStyle: 'italic' },
  timeSinceText: { color: Colors.subText, fontSize: 12, fontStyle: 'italic', marginBottom: 8 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  
  sandboxBadge: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2
  },
  sandboxText: {
    color: Colors.primary,
    fontSize: 9,
    fontWeight: 'bold'
  },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.white, borderRadius: 16, padding: 24, elevation: 10 },
  modalBreached: { borderColor: Colors.error, borderWidth: 2 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.black, marginBottom: 16, textAlign: 'center' },
  closeModalBtn: { position: 'absolute', right: 16, top: 16, zIndex: 10, padding: 4 },
  minimizeModalBtn: { position: 'absolute', left: 16, top: 16, zIndex: 10, padding: 4 },
  totalAmount: { fontSize: 22, fontWeight: 'bold', color: Colors.success, marginBottom: 16 },
  actionRowModal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  rejectButtonModal: { flex: 0.45, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.grey, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: Colors.error, fontWeight: 'bold', fontSize: 15 },
  acceptButtonModal: { flex: 0.55, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.success, marginLeft: 12, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: Colors.success, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  acceptText: { color: Colors.white, fontWeight: '800', fontSize: 18 },
  breachedWarningContainer: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEEBA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  breachedWarning: { 
    color: '#856404', 
    fontSize: 12, 
    fontWeight: '600',
    marginLeft: 8,
    flex: 1
  },
  
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
