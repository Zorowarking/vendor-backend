const { Server } = require('socket.io');
const { prisma } = require('./prisma');

let io;

/**
 * Initialize Socket.io
 */
const initSocket = (server) => {
  io = new Server(server, {
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    allowEIO3: true, // Compatibility for some older clients
    cors: {
      origin: '*', // For production, use specific origins
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }
  });

  // Namespaces
  const customerNs = io.of('/customer');
  const vendorNs = io.of('/vendor');
  const adminNs = io.of('/admin');

  // Customer connections
  customerNs.on('connection', (socket) => {
    console.log(`[SOCKET] Customer connected: ${socket.id} (Namespace: /customer)`);
    
    socket.on('disconnect', (reason) => {
      console.log(`[SOCKET] Customer disconnected: ${socket.id}, Reason: ${reason}`);
    });
    
    socket.on('join_order_room', (orderId) => {
      socket.join(`order_${orderId}`);
      console.log(`[SOCKET] Customer joined order room: ${orderId}`);
    });
  });

  // Vendor connections
  vendorNs.on('connection', (socket) => {
    console.log('[SOCKET] Vendor connected:', socket.id);
    
    socket.on('join_vendor_room', (vendorId) => {
      socket.join(`vendor_${vendorId}`);
    });
  });

  // Admin connections (Global monitoring)
  adminNs.on('connection', (socket) => {
    socket.join('admin_global');
  });

  return io;
};

/**
 * Emit Location Update (for third-party delivery tracking integration)
 */
const emitLocationUpdate = (orderId, lat, lng, pickupEta = null, dropEta = null) => {
  if (!io) return;
  io.of('/customer').to(`order_${orderId}`).emit('rider_location_update', { lat, lng, pickupEta, dropEta });
  io.of('/admin').to('admin_global').emit('rider_location_update', { orderId, lat, lng, pickupEta, dropEta });
};

/**
 * Emit Order Status Change
 */
const emitOrderStatusUpdate = (orderId, status, actor) => {
  if (!io) return;
  io.of('/customer').to(`order_${orderId}`).emit('order_status_update', { orderId, status, updatedBy: actor });
  io.of('/admin').to('admin_global').emit('order_status_update', { orderId, status, updatedBy: actor });
};

/**
 * Emit Incoming Order to Vendor
 */
const emitIncomingOrder = (vendorId, orderData) => {
  if (!io) return;
  io.of('/vendor').to(`vendor_${vendorId}`).emit('new_incoming_order', orderData);
  io.of('/admin').to('admin_global').emit('new_order_created', orderData);
};

/**
 * Emit Vendor Status Update to all customers
 */
const emitVendorStatusUpdate = (vendorId, isOnline) => {
  if (!io) return;
  io.of('/customer').emit('vendor_status_update', { vendorId, isOnline });
  console.log(`[SOCKET] Vendor status update broadcasted: Vendor ${vendorId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
};

/**
 * Emit Product Status Update to Vendor
 */
const emitProductStatusUpdate = (vendorId, productId, status) => {
  if (!io) return;
  io.of('/vendor').to(`vendor_${vendorId}`).emit('product_status_update', { productId, status });
  console.log(`[SOCKET] Product status update sent to Vendor ${vendorId}: Product ${productId} is now ${status}`);
};

/**
 * Emit Account Status Update to Vendor/Rider
 */
const emitAccountStatusUpdate = (userId, status) => {
  if (!io) return;
  // Try both vendor and rider namespaces/rooms just in case
  io.of('/vendor').to(`vendor_${userId}`).emit('account_status_update', { status });
  io.of('/rider').to(`rider_${userId}`).emit('account_status_update', { status });
  console.log(`[SOCKET] Account status update sent to User ${userId}: ${status}`);
};

module.exports = {
  initSocket,
  emitLocationUpdate,
  emitOrderStatusUpdate,
  emitIncomingOrder,
  emitVendorStatusUpdate,
  emitProductStatusUpdate,
  emitAccountStatusUpdate,
  getIo: () => io
};
