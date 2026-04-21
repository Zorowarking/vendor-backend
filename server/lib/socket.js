const { Server } = require('socket.io');
const { prisma } = require('./prisma');

let io;

/**
 * Initialize Socket.io
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Adjust for production
      methods: ['GET', 'POST']
    }
  });

  // Namespaces
  const customerNs = io.of('/customer');
  const vendorNs = io.of('/vendor');
  const riderNs = io.of('/rider');
  const adminNs = io.of('/admin');

  // Customer connections (Listen for location updates and order updates)
  customerNs.on('connection', (socket) => {
    console.log('[SOCKET] Customer connected:', socket.id);
    
    socket.on('join_order_room', (orderId) => {
      socket.join(`order_${orderId}`);
      console.log(`[SOCKET] Customer joined order room: ${orderId}`);
    });
  });

  // Vendor connections
  vendorNs.on('connection', (socket) => {
    console.log('[SOCKET] Vendor connected:', socket.id);
    
    // Vendor authenticates and joins their own room to receive incoming orders
    socket.on('join_vendor_room', (vendorId) => {
      socket.join(`vendor_${vendorId}`);
    });
  });

  // Rider connections
  riderNs.on('connection', (socket) => {
    console.log('[SOCKET] Rider connected:', socket.id);

    // Rider updates their location for a specific order
    socket.on('rider:location', ({ orderId, lat, lng }) => {
      console.log(`[SOCKET] Rider location update for order ${orderId}: ${lat}, ${lng}`);
      emitLocationUpdate(orderId, lat, lng);
      
      // Also update DB asynchronously for persistence (optional, but good for refresh)
      prisma.rider.updateMany({
        where: { orders: { some: { id: orderId } } },
        data: { currentLat: lat, currentLng: lng }
      }).catch(err => console.error('[SOCKET] DB Update Error:', err));
    });
  });

  // Admin connections (Global monitoring)
  adminNs.on('connection', (socket) => {
    socket.join('admin_global');
  });

  return io;
};

/**
 * Emit Location Update
 */
const emitLocationUpdate = (orderId, lat, lng) => {
  if (!io) return;
  io.of('/customer').to(`order_${orderId}`).emit('rider_location_update', { lat, lng });
  io.of('/admin').to('admin_global').emit('rider_location_update', { orderId, lat, lng });
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

module.exports = {
  initSocket,
  emitLocationUpdate,
  emitOrderStatusUpdate,
  emitIncomingOrder,
  emitVendorStatusUpdate,
  getIo: () => io
};
