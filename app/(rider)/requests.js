import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  Animated, 
  Alert,
  Dimensions,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  TextInput
} from 'react-native';

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useRiderStore } from '../../store/riderStore';
import { riderApi } from '../../services/riderApi';
import Colors from '../../constants/Colors';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as Haptics from 'expo-haptics';
import { socketService } from '../../services/socketService';

import { RefreshControl } from 'react-native';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';

const { width } = Dimensions.get('window');
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function RequestsScreen() {
  const router = useRouter();
  const { isOnline, activeOrder, pickupRequests, addPickupRequest, removePickupRequest, setActiveOrder, currentLocation } = useRiderStore();
  const [pulseAnim] = useState(new Animated.Value(1));
  const [timer, setTimer] = useState(60);
  const [currentRequest, setCurrentRequest] = useState(null);
  
  // Tracking States
  const [loading, setLoading] = useState(false);
  const [routeCoords, setRouteCoords] = useState([]);
  const [arrived, setArrived] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef(null);

  // Cancellation Modal State
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOverview, setCancelOverview] = useState('');



  // Mock pickup/delivery locations
  const pickupLoc = { latitude: 40.7128, longitude: -74.0060 };
  const deliveryLoc = { latitude: 40.7484, longitude: -73.9857 };

  useEffect(() => {
    if (!isOnline) return;

    const cleanup = socketService.onRiderEvents({
      onPickupRequest: (request) => {
        console.log('New pickup request received via socket:', request.id);
        addPickupRequest(request);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onOrderUpdate: (update) => {
        console.log('Order update received via socket:', update);
        if (activeOrder && activeOrder.id === update.orderId) {
          setActiveOrder({ ...activeOrder, ...update });
        }
      }
    });

    return cleanup;
  }, [isOnline, activeOrder]);

  // Pulse animation for "Waiting" state
  useEffect(() => {
    if (isOnline && !activeOrder && pickupRequests.length === 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
    }
  }, [isOnline, activeOrder, pickupRequests]);

  // Request queue management
  useEffect(() => {
    if (pickupRequests.length > 0 && !currentRequest) {
      setCurrentRequest(pickupRequests[0]);
      setTimer(60);
    }
  }, [pickupRequests, currentRequest]);

  // Modal Countdown Timer
  useEffect(() => {
    let interval;
    if (currentRequest) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            handleReject();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentRequest]);

  const contactSupport = () => {
    Alert.alert('Support', 'Connecting you to rider support...', [{ text: 'OK' }]);
  };

  const handleArrived = () => {
    setArrived(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Status Updated', 'Vendor has been notified of your arrival.');
  };


  useEffect(() => {
    if (activeOrder && currentLocation) {
      fetchRoute();
    }
  }, [activeOrder, currentLocation]);

  const fetchRoute = async () => {
    if (!GOOGLE_MAPS_API_KEY) return;
    try {
      const resp = await axios.get(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${deliveryLoc.latitude},${deliveryLoc.longitude}&waypoints=${pickupLoc.latitude},${pickupLoc.longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      if (resp.data.routes.length > 0) {
        const points = resp.data.routes[0].overview_polyline.points;
        const decoded = decodePolyline(points);
        setRouteCoords(decoded);
      }
    } catch (error) {
      console.warn('Failed to fetch route:', error);
      // Fallback: Clear routes to avoid showing stale data
      setRouteCoords([]);
    }

  };

  const decodePolyline = (t) => {
    let e, r, a = 0, l = 0, n = 0, i = [], c = 0, o = 0, s = 0, d = 0, u = 0, g = 0;
    while (a < t.length) {
      for (e = 0, r = 0; s = t.charCodeAt(a++) - 63, e |= (31 & s) << r, r += 5, s >= 32;);
      l += 1 & e ? ~(e >> 1) : e >> 1;
      for (e = 0, r = 0; s = t.charCodeAt(a++) - 63, e |= (31 & s) << r, r += 5, s >= 32;);
      n += 1 & e ? ~(e >> 1) : e >> 1;
      i.push({ latitude: l / 1e5, longitude: n / 1e5 });
    }
    return i;
  };

  const handleEmergencyCancel = () => {
    setIsCancelModalVisible(true);
  };

  const submitCancellation = async () => {
    if (!cancelReason) {
      Alert.alert('Selection Required', 'Please select a reason for cancellation.');
      return;
    }

    Alert.alert(
      'Are you absolutely sure?',
      'This cancellation will be logged and may significantly affect your compliance record. Only proceed for genuine emergencies.',
      [
        { text: 'Wait, Go Back', style: 'cancel' },
        { 
          text: 'Confirm Cancellation', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await riderApi.updateDeliveryStatus(activeOrder.id, 'CANCELLED_BY_RIDER', {
                cancellationReason: cancelReason,
                cancellationOverview: cancelOverview
              });
              setActiveOrder(null);
              setArrived(false);
              setRouteCoords([]);
              setIsCancelModalVisible(false);
              setCancelReason('');
              setCancelOverview('');
              Alert.alert('Delivery Cancelled', 'Your request has been logged. The system will re-assign this order shortly.');
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel delivery. Please contact support.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };



  const updateStatus = async (newStatus) => {
    setLoading(true);
    try {
      await riderApi.updateDeliveryStatus(activeOrder.id, newStatus);
      if (newStatus === 'DELIVERED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Delivery Completed!', [
          { text: 'Great!', onPress: () => {

            setActiveOrder(null);
            setArrived(false);
            setRouteCoords([]);
          } }
        ]);
      } else {
        setActiveOrder({ ...activeOrder, status: newStatus });
      }

    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };


  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Simulate/Trigger re-fetch from storage or API
      const { fetchEarnings } = useRiderStore.getState(); // Assuming some global refresh
      // For now, just a clear delay to show it's working
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
       console.error('Refresh failed', error);
    } finally {
      setRefreshing(false);
    }
  };



  const triggerMockRequest = () => {
    const mockRequest = {
      id: Math.floor(1000 + Math.random() * 9000).toString(),
      vendorName: 'Pizza Palace (Mock)',
      vendorAddress: '456 Dough Ave, Lower East Side',
      customerAddress: '789 Maple St, Brooklyn',
      estimatedEarnings: 8.50,
      distance: '2.4 km',
      items: [{ name: 'Large Pepperoni', qty: 1 }],
      status: 'PENDING'
    };
    addPickupRequest(mockRequest);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAccept = async () => {
    if (isAccepting) return;
    
    setIsAccepting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await riderApi.acceptRequest(currentRequest.id);
      setActiveOrder(currentRequest);
      removePickupRequest(currentRequest.id);
      setCurrentRequest(null);
    } catch (error) {
      // Check for Race Condition (Order already taken)
      const errorData = error.response?.data || {};
      if (errorData.code === 'already_assigned' || error.response?.status === 409) {
        Alert.alert(
          'Too Late!', 
          'This order was just accepted by another rider. Better luck next time!',
          [{ text: 'OK', onPress: () => {
            removePickupRequest(currentRequest.id);
            setCurrentRequest(null);
          }}]
        );
      } else {
        Alert.alert('Error', 'Failed to accept request. Please try again.');
        // Still clear the current request if it's likely gone
        removePickupRequest(currentRequest.id);
        setCurrentRequest(null);
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    try {
      await riderApi.rejectRequest(currentRequest.id);
      removePickupRequest(currentRequest.id);
      setCurrentRequest(null);
    } catch (error) {
      setCurrentRequest(null);
    }
  };

  const handleNavigate = () => {
    if (!activeOrder) return;
    const destination = activeOrder.status === 'PICKED_UP' ? activeOrder.customerAddress : activeOrder.vendorAddress;
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${encodeURIComponent(destination)}`,
      android: `google.navigation:q=${encodeURIComponent(destination)}`
    });
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`);
    });
  };

  if (loading && !activeOrder && !currentRequest) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 20 }}>
          <SkeletonLoader width={width - 40} height={150} style={{ marginBottom: 20 }} />
          <SkeletonLoader width={width - 40} height={100} style={{ marginBottom: 20 }} />
          <SkeletonLoader width={width - 40} height={200} />
        </View>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={80} color={Colors.subText} />
        <Text style={styles.offlineTitle}>You're Offline</Text>
        <Text style={styles.offlineSub}>Go online to start receiving products</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activeOrder ? (
         <View style={{ flex: 1 }}>
           {/* Map Section */}
           <View style={styles.mapContainer}>
             <MapView
               ref={mapRef}
               style={styles.map}
               provider={PROVIDER_GOOGLE}
               initialRegion={{
                 ...pickupLoc,
                 latitudeDelta: 0.05,
                 longitudeDelta: 0.05,
               }}
               showsUserLocation
             >
               <Marker 
                 coordinate={pickupLoc} 
                 title="Pickup: Vendor" 
                 pinColor={Colors.primary} 
               />
               <Marker 
                 coordinate={deliveryLoc} 
                 title="Dropoff: Customer" 
                 pinColor={Colors.success} 
               />
               {routeCoords.length > 0 && (
                 <Polyline 
                   coordinates={routeCoords} 
                   strokeWidth={4} 
                   strokeColor={Colors.primary} 
                 />
               )}
             </MapView>
           </View>
 
           {/* Tracking Bottom Sheet */}
           <View style={styles.bottomSheet}>
             <View style={styles.sheetHeader}>
               <View>
                 <Text style={styles.orderLabel}>Active Delivery</Text>
                 <Text style={styles.statusDisplay}>
                   {activeOrder.status?.replace(/_/g, ' ') || 'ON THE WAY TO PICKUP'}
                 </Text>
               </View>
               <TouchableOpacity onPress={handleNavigate} style={styles.navIcon}>
                 <Ionicons name="navigate-circle" size={44} color={Colors.primary} />
                 <Text style={styles.navLabel}>Navigate</Text>
               </TouchableOpacity>
             </View>
 
             <View style={styles.divider} />
 
             <ScrollView 
               contentContainerStyle={styles.sheetScroll}
               showsVerticalScrollIndicator={false}
             >
               <View style={styles.summaryRow}>
                 <View style={styles.vendorBox}>
                    <Text style={styles.vendorName}>{activeOrder.vendorName}</Text>
                    <Text style={styles.vendorAddress} numberOfLines={1}>{activeOrder.vendorAddress}</Text>
                 </View>
                 <TouchableOpacity onPress={contactSupport} style={styles.supportBtn}>
                   <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
                   <Text style={styles.supportText}>Support</Text>
                 </TouchableOpacity>
               </View>
 
               <View style={styles.actionButtons}>
                 {activeOrder.status !== 'PICKED_UP' ? (
                   <View>
                     {!arrived && (
                       <TouchableOpacity 
                         style={[styles.mainBtn, { backgroundColor: Colors.warning, marginBottom: 12 }]}
                         onPress={handleArrived}
                       >
                         <Text style={styles.btnText}>I've Arrived at Vendor</Text>
                       </TouchableOpacity>
                     )}
                     <TouchableOpacity 
                       style={[styles.mainBtn, { backgroundColor: Colors.primary }]}
                       onPress={() => updateStatus('PICKED_UP')}
                       disabled={loading}
                     >
                       {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.btnText}>Order Picked Up</Text>}
                     </TouchableOpacity>
                   </View>
                 ) : (
                    <TouchableOpacity 
                      style={[styles.mainBtn, { backgroundColor: Colors.success }]}
                      onPress={() => updateStatus('DELIVERED')}
                      disabled={loading}
                    >
                      {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.btnText}>Mark Delivered</Text>}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity 
                    style={styles.emergencyBtn} 
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      setIsCancelModalVisible(true);
                    }}
                  >
                    <Ionicons name="warning-outline" size={16} color={Colors.error} />
                    <Text style={styles.emergencyText}>Can't Deliver (Emergency)</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 120 }} />
             </ScrollView>
           </View>
         </View>
      ) : (
        <ScrollView 
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}

          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        >
          <View style={styles.waitingContainer}>
              <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="bicycle" size={40} color={Colors.primary} />
              </Animated.View>
              <Text style={styles.waitingTitle}>You're online!</Text>
              <Text style={styles.waitingSub}>Waiting for orders near you...</Text>
              
              <TouchableOpacity 
                style={[styles.mainBtn, { backgroundColor: Colors.info, marginTop: 40, width: '80%' }]}
                onPress={triggerMockRequest}
              >
                <Text style={styles.btnText}>[DEV] Trigger Mock Request</Text>
              </TouchableOpacity>
            </View>

        </ScrollView>
      )}

      {/* Cancellation Modal */}
      <Modal 
        visible={isCancelModalVisible} 
        transparent 
        animationType="fade"
        onRequestClose={() => setIsCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 40 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Can't Deliver Order</Text>
              <TouchableOpacity onPress={() => setIsCancelModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.black} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Please select a reason for cancelling this mission.</Text>

            <View style={styles.reasonsGrid}>
              {['Vehicle Breakdown', 'Medical Emergency', 'Accident', 'Personal Emergency', 'Other'].map((item) => (
                <TouchableOpacity 
                   key={item}
                   style={[styles.reasonItem, cancelReason === item && styles.reasonItemSelected]}
                   onPress={() => setCancelReason(item)}
                >
                  <Text style={[styles.reasonText, cancelReason === item && styles.reasonTextSelected]}>{item}</Text>
                  {cancelReason === item && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.overviewContainer}>
              <Text style={styles.inputLabel}>Additional Overview</Text>
              <TextInput 
                style={styles.textArea}
                placeholder="Briefly describe the situation..."
                multiline
                numberOfLines={4}
                value={cancelOverview}
                onChangeText={setCancelOverview}
              />
            </View>

            <TouchableOpacity 
              style={[styles.confirmCancelBtn, loading && styles.disabledButton]} 
              onPress={submitCancellation}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.confirmCancelBtnText}>Confirm Cancellation</Text>}
            </TouchableOpacity>
            
            <Text style={styles.warningText}>
              Warning: This action will be logged and may affect your compliance record.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Incoming Request Modal */}

      <Modal visible={!!currentRequest} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.timerCircle}>
              <Text style={styles.timerText}>{timer}s</Text>
            </View>
            
            <Text style={styles.newRequestTitle}>New Pickup Request!</Text>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Earnings</Text>
                <Text style={styles.statValue}>${currentRequest?.estimatedEarnings}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>{currentRequest?.distance}</Text>
              </View>
            </View>

            <View style={styles.modalAddressContainer}>
              <View style={styles.modalAddressRow}>
                <Ionicons name="restaurant" size={20} color={Colors.primary} />
                <View style={styles.modalAddressInfo}>
                  <Text style={styles.modalAddressLabel}>Pickup</Text>
                  <Text style={styles.modalAddressValue}>{currentRequest?.vendorName}</Text>
                </View>
              </View>
              <View style={styles.modalAddressRow}>
                <Ionicons name="location" size={20} color={Colors.success} />
                <View style={styles.modalAddressInfo}>
                  <Text style={styles.modalAddressLabel}>Delivery</Text>
                  <Text style={styles.modalAddressValue}>{currentRequest?.customerAddress}</Text>
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.rejectBtn} onPress={handleReject}>
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.acceptBtn, isAccepting && styles.disabledButton]} 
                onPress={handleAccept}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grey },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  offlineTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.black, marginTop: 20 },
  offlineSub: { fontSize: 16, color: Colors.subText, textAlign: 'center', marginTop: 10 },
  
  waitingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pulseCircle: { 
    width: 100, height: 100, borderRadius: 50, 
    backgroundColor: Colors.primary + '20', 
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20 
  },
  waitingTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
  waitingSub: { fontSize: 16, color: Colors.subText, marginTop: 8 },

  waitingContainer: { height: Dimensions.get('window').height * 0.7, justifyContent: 'center', alignItems: 'center' },
  pulseCircle: { 
    width: 100, height: 100, borderRadius: 50, 
    backgroundColor: Colors.primary + '20', 
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20 
  },
  waitingTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
  waitingSub: { fontSize: 16, color: Colors.subText, marginTop: 8 },

  // Tracking Styles
  mapContainer: { height: '55%', backgroundColor: Colors.border },
  map: { flex: 1 },
  bottomSheet: { 
    flex: 1, backgroundColor: Colors.white, 
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    marginTop: -30, padding: 20, elevation: 20,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  orderLabel: { fontSize: 12, color: Colors.subText, fontWeight: '600', textTransform: 'uppercase' },
  statusDisplay: { fontSize: 22, fontWeight: 'bold', color: Colors.black, marginTop: 4 },
  navIcon: { alignItems: 'center' },
  navLabel: { fontSize: 10, color: Colors.primary, fontWeight: 'bold', marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 15 },
  sheetScroll: { paddingTop: 5 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 },
  vendorBox: { flex: 1, marginRight: 10 },
  vendorName: { fontSize: 18, fontWeight: 'bold', color: Colors.black },
  vendorAddress: { fontSize: 14, color: Colors.subText, marginTop: 4 },
  supportBtn: { 
    flexDirection: 'row', alignItems: 'center', 
    paddingHorizontal: 12, paddingVertical: 8, 
    backgroundColor: Colors.primary + '10', borderRadius: 20 
  },
  supportText: { marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: Colors.primary },
  actionButtons: { width: '100%' },
  mainBtn: { padding: 18, borderRadius: 16, alignItems: 'center' },
  btnText: { color: Colors.white, fontWeight: 'bold', fontSize: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, alignItems: 'center' },
  timerCircle: { 
    width: 60, height: 60, borderRadius: 30, 
    borderWidth: 4, borderColor: Colors.primary, 
    justifyContent: 'center', alignItems: 'center',
    marginTop: -55, backgroundColor: Colors.white
  },
  timerText: { fontWeight: 'bold', fontSize: 18, color: Colors.primary },
  newRequestTitle: { fontSize: 24, fontWeight: 'bold', marginVertical: 20 },
  statsRow: { flexDirection: 'row', marginBottom: 25 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: Colors.subText },
  statValue: { fontSize: 20, fontWeight: 'bold', color: Colors.black },
  
  modalAddressContainer: { width: '100%', backgroundColor: Colors.grey, borderRadius: 16, padding: 15, marginBottom: 25 },
  modalAddressRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  modalAddressInfo: { marginLeft: 15 },
  modalAddressLabel: { fontSize: 12, color: Colors.subText },
  modalAddressValue: { fontSize: 16, fontWeight: 'bold' },
  disabledButton: { opacity: 0.6 },

  modalActions: {
    flexDirection: 'row',
    width: '100%',
    paddingTop: 10,
    gap: 12,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  rejectBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.subText,
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },

  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    padding: 10,
  },
  emergencyText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    textDecorationLine: 'underline',
  },
  // Cancellation Modal Specifics
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.black,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.subText,
    marginBottom: 20,
    textAlign: 'center',
  },
  reasonsGrid: {
    width: '100%',
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  reasonItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '05',
  },
  reasonText: {
    fontSize: 15,
    color: Colors.text,
  },
  reasonTextSelected: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  overviewContainer: {
    width: '100%',
    marginBottom: 25,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subText,
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    color: Colors.black,
  },
  confirmCancelBtn: {
    width: '100%',
    padding: 18,
    backgroundColor: Colors.error,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 15,
  },
  confirmCancelBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  warningText: {
    fontSize: 11,
    color: Colors.error,
    textAlign: 'center',
    fontStyle: 'italic',
  }
});

