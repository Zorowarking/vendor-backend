import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://192.168.0.105:3000';

class SocketService {
  constructor() {
    this.socket = null;
    this.role = null;
    this.userId = null;
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
    
    this.socket = io(namespaceUrl, {
      transports: ['websocket'], // ONLY WebSocket to prevent 502 polling storms
      auth: { token },
      query: { 
        userId, 
        role,
        ...(role === 'VENDOR' ? { vendorId: userId } : { riderId: userId })
      },
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log(`${role} Socket connected:`, this.socket.id);
      if (role === 'VENDOR') {
        this.socket.emit('join_vendor_room', userId);
      } else {
        this.socket.emit('join:rider', { riderId: userId });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`${role} Socket disconnected:`, reason);
      if (reason === 'io server disconnect') {
        // Reconnect manually if server forcefully disconnected
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (err) => {
      // Silence noisy errors during production or clean logs
      if (err.message.includes('timeout') || err.message.includes('xhr poll error')) {
        console.warn('Socket: Offline Mode (No backend detected).');
      } else {
        console.error('Socket connection error:', err.message);
      }
    });

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
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.userId = null;
      this.role = null;
    }
  }

  // Generic on/off/emit
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
