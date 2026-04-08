import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3000';

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
    
    this.socket = io(SOCKET_URL, {
      auth: { token },
      query: { 
        userId, 
        role,
        ...(role === 'VENDOR' ? { vendorId: userId } : { riderId: userId })
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log(`${role} Socket connected:`, this.socket.id);
      const joinEvent = role === 'VENDOR' ? 'join:vendor' : 'join:rider';
      this.socket.emit(joinEvent, { [role === 'VENDOR' ? 'vendorId' : 'riderId']: userId });
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`${role} Socket disconnected:`, reason);
      if (reason === 'io server disconnect') {
        // Reconnect manually if server forcefully disconnected
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (err) => {
      // Silence noisy errors during mock testing
      if (err.message.includes('timeout') || err.message.includes('xhr poll error')) {
        console.warn('Socket: Offline Mode (No backend detected). Using mock data fallback.');
      } else {
        console.error('Socket connection error:', err.message);
      }
    });

  }

  // Backward compatibility methods
  connectRider(riderId) {
    this.connect(riderId, 'RIDER');
  }

  onRiderEvents({ onPickupRequest, onOrderUpdate }) {
    if (!this.socket) return () => {};
    
    if (onPickupRequest) this.socket.on('new:pickupRequest', onPickupRequest);
    if (onOrderUpdate) this.socket.on('order:update', onOrderUpdate);

    return () => {
      if (onPickupRequest) this.socket.off('new:pickupRequest', onPickupRequest);
      if (onOrderUpdate) this.socket.off('order:update', onOrderUpdate);
    };
  }

  onNewOrder(callback) {
    if (!this.socket) return;
    this.socket.on('new:order', callback);
  }

  offNewOrder(callback) {
    if (!this.socket) return;
    this.socket.off('new:order', callback);
  }

  onOrderUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('order:update', callback);
  }

  offOrderUpdate(callback) {
    if (!this.socket) return;
    this.socket.off('order:update', callback);
  }

  onPickupRequest(callback) {
    if (!this.socket) return;
    this.socket.on('new:pickupRequest', callback);
  }

  onOrderStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('order:statusUpdate', callback);
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
