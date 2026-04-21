const { prisma } = require('../lib/prisma');
const { orderSlaQueue } = require('../lib/bullmq');
const { emitOrderStatusUpdate } = require('../lib/socket');
const fcm = require('../lib/fcm');

/**
 * Order Service for managing order lifecycle, status changes, and notifications.
 */
class OrderService {
  /**
   * Create order after payment verification
   */
  static async createOrderFromCart(cart, customerId, customerName, deliveryPreference) {
    if (!cart.vendorId) {
      console.error('[ORDER-SERVICE] CRITICAL: Attempted to create order with NO vendorId');
      throw new Error('CART_INVALID: Missing vendor identification');
    }

    if (!cart.total || isNaN(cart.total)) {
      console.warn('[ORDER-SERVICE] Cart total is missing or NaN. Recalculating.');
      // Safe fallback if calculation failed earlier
    }

    // 1. Snapshot the Address & Check Vendor Availability
    console.log(`[ORDER-SERVICE] Creating Order for Customer: ${customerId} (${customerName}) from Cart: ${cart.id}`);
    
    // VENDOR GATEKEEPER
    const vendor = await prisma.vendor.findUnique({ where: { id: cart.vendorId } });
    if (!vendor || vendor.onlineStatus !== 'online') {
      throw new Error('VENDOR_OFFLINE: Vendor is currently not accepting orders.');
    }

    const { checkVendorAvailability } = require('../lib/availability');
    const { isOpen, nextOpen } = checkVendorAvailability(vendor.operatingHours);
    if (!isOpen) {
      throw new Error(`VENDOR_CLOSED: Vendor is currently closed. Reopening ${nextOpen || 'soon'}.`);
    }

    const activeAddress = await prisma.address.findUnique({
      where: { customerId: customerId }
    });

    const addressSnapshot = activeAddress || { addressLine1: cart.deliveryAddress || 'Default' };

    const order = await prisma.order.create({
      data: {
        vendorId: cart.vendorId,
        customerId: customerId,
        addressSnapshot: addressSnapshot,
        subtotal: Number(cart.subtotal || 0),
        totalAmount: Number(cart.total || 0),
        status: 'Awaiting Vendor Acceptance',
        deliveryPreference: deliveryPreference || 'standard',
        statusHistory: {
          create: {
            status: 'Awaiting Vendor Acceptance',
            changedBy: 'CUSTOMER'
          }
        },
        items: {
          create: cart.items.map(item => ({
            productId: item.productId,
            productName: item.name || 'Unknown Product',
            quantity: item.quantity,
            unitPrice: Number(item.price || 0),
            lineTotal: Number(item.total || 0)
          }))
        }
      }
    });
    console.log(`[ORDER-SERVICE] SUCCESS: Order persisted with ID: ${order.id}`);

    // 2. Clear the cart
    console.log(`[ORDER-SERVICE] Deleting checkout cart: ${cart.id}`);
    await prisma.cart.delete({ where: { id: cart.id } });

    // 3. Fire Notifications
    // To Vendor
    emitOrderStatusUpdate(order.id, 'Awaiting Vendor Acceptance', 'CUSTOMER');
    await fcm.sendToVendor(cart.vendorId, {
      title: 'New Order Received',
      body: `Order #${order.id.substring(0,8)} is awaiting your acceptance.`,
      orderId: order.id
    });

    // 4. Start BullMQ SLA Timer (5 minutes)
    await orderSlaQueue.add('vendorSlaTimeout', 
      { orderId: order.id, type: 'vendor_accept' }, 
      { delay: 5 * 60 * 1000 }
    );

    return order;
  }

  /**
   * Update order status and notify all parties
   */
  static async updateOrderStatus(orderId, newStatus, actorRole) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { 
        status: newStatus,
        statusHistory: {
          create: {
            status: newStatus,
            changedBy: actorRole
          }
        }
      },
      include: { 
        customer: {
          include: { profile: true }
        }
      }
    });

    // Notify Customer via WS and FCM
    emitOrderStatusUpdate(orderId, newStatus, actorRole);
    
    if (order.customer?.profile?.firebaseUid) {
      await fcm.sendToCustomer(order.customer.profile.firebaseUid, {
        title: `Order Update: ${newStatus}`,
        body: `Your order status has changed to ${newStatus}.`,
        orderId: order.id
      });
    }

    // Analytics: Fire 'Order Completed' event
    if (newStatus === 'Delivered') {
      await prisma.analyticsEvent.create({
        data: {
          event: 'order_completed',
          orderId: orderId,
          customerId: order.customerId,
          firedAt: new Date()
        }
      });
    }

    return order;
  }
}

module.exports = OrderService;
