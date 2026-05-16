import { io } from 'socket.io-client';
import { AppState } from 'react-native';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://vendor-backend-production-c171.up.railway.app';

class SocketService {
  constructor() {
    this.socket = null;
    this.role = null;
    this.userId = null;
    this.appStateSubscription = null;
  }

  connect(userId, role = 'VENDOR') {
    if (this.socket) {
      if (this.userId === userId && this.role === role) return;
      this.disconnect();
    }

    this.userId = userId;
    this.role = role;
    
    const token = useAuthStore.getState().sessionToken;
    
    const namespaceUrl = role === 'VENDOR' ? `${SOCKET_URL}/vendor` : `${SOCKET_URL}/rider`;
    console.log(`[SOCKET] Connecting to ${namespaceUrl}...`);
    
    this.socket = io(namespaceUrl, {
      transports: ['websocket'],
      auth: { token },
      query: { 
        userId, 
        role,
        ...(role === 'VENDOR' ? { vendorId: userId } : { riderId: userId })
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log(`${role} Socket connected:`, this.socket.id);
      this._joinRoom();
    });

    // Handle reconnection - re-join rooms automatically
    this.socket.on('reconnect', (attempt) => {
      console.log(`[SOCKET] Reconnected after ${attempt} attempts. Re-joining rooms...`);
      this._joinRoom();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`${role} Socket disconnected:`, reason);
      if (reason === 'io server disconnect' || reason === 'transport close') {
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (err) => {
      if (err.message.includes('timeout') || err.message.includes('xhr poll error')) {
        console.warn(`[SOCKET] Offline Mode: Could not reach ${SOCKET_URL}.`);
      } else {
        console.error('[SOCKET] Connection error details:', err.message);
      }
    });

    // AppState listener for instant foreground recovery
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    this.appStateSubscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        console.log('[SOCKET] App returned to foreground. Ensuring connection...');
        if (this.socket && !this.socket.connected) {
          this.socket.connect();
        }
      }
    });
  }

  _joinRoom() {
    if (!this.socket || !this.userId) return;
    if (this.role === 'VENDOR') {
      this.socket.emit('join_vendor_room', this.userId);
    } else {
      this.socket.emit('join:rider', { riderId: this.userId });
    }
  }

  onNewOrder(callback) {
    if (!this.socket) return;
    this.socket.on('new_incoming_order', callback);
  }

  offNewOrder(callback) {
    if (!this.socket) return;
    this.socket.off('new_incoming_order', callback);
  }

  onOrderUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('order_status_update', callback);
  }

  offOrderUpdate(callback) {
    if (!this.socket) return;
    this.socket.off('order_status_update', callback);
  }

  onOrderStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('order_status_update', callback);
  }

  onRiderLocationUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('rider_location_update', callback);
  }

  offRiderLocationUpdate(callback) {
    if (!this.socket) return;
    this.socket.off('rider_location_update', callback);
  }

  onProductStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('product_status_update', callback);
  }

  offProductStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.off('product_status_update', callback);
  }

  onAccountStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('account_status_update', callback);
  }

  offAccountStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.off('account_status_update', callback);
  }

  emitLocation(orderId, latitude, longitude) {
    if (!this.socket) return;
    this.socket.emit('rider:location', { orderId, latitude, longitude });
  }

  disconnect() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.userId = null;
      this.role = null;
    }
  }

  on(event, callback) {
    if (this.socket) this.socket.on(event, callback);
  }

  off(event, callback) {
    if (this.socket) this.socket.off(event, callback);
  }

  emit(event, data) {
    if (this.socket) this.socket.emit(event, data);
  }
}

export const socketService = new SocketService();
