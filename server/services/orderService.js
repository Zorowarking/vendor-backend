const { prisma } = require('../lib/prisma');
const { orderSlaQueue } = require('../lib/bullmq');
const { emitOrderStatusUpdate, emitIncomingOrder } = require('../lib/socket');
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

    // 1. Check Vendor Availability
    const vendor = await prisma.vendor.findUnique({ where: { id: cart.vendorId } });
    if (!vendor || vendor.onlineStatus !== 'online') {
      throw new Error('VENDOR_OFFLINE: Vendor is currently not accepting orders.');
    }

    const { checkVendorAvailability } = require('../lib/availability');
    const { isOpen, nextOpen } = checkVendorAvailability(vendor.operatingHours);
    if (!isOpen) {
      throw new Error(`VENDOR_CLOSED: Vendor is currently closed. Reopening ${nextOpen || 'soon'}.`);
    }

    const activeAddress = await prisma.address.findFirst({
      where: { customerId: customerId },
      orderBy: { createdAt: 'desc' }
    });

    const addressSnapshot = activeAddress || { addressLine1: 'Default Address' };

    const order = await prisma.order.create({
      data: {
        vendorId: cart.vendorId,
        customerId: customerId,
        addressSnapshot: addressSnapshot,
        subtotal: Number(cart.subtotal || 0),
        totalAmount: Number(cart.total || 0),
        status: 'pending_vendor',
        deliveryPreference: deliveryPreference || 'standard',
        statusHistory: {
          create: {
            status: 'pending_vendor',
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
      },
      include: {
        items: true
      }
    });

    // 2. Clear the cart
    await prisma.cart.delete({ where: { id: cart.id } });

    // 3. Fire Notifications
    emitOrderStatusUpdate(order.id, 'pending_vendor', 'CUSTOMER');
    
    const formattedOrder = {
      ...order,
      customerName: customerName,
      total: Number(order.totalAmount),
      items: order.items.map(i => ({ qty: i.quantity, name: i.productName }))
    };
    emitIncomingOrder(cart.vendorId, formattedOrder);
    
    // Update Floating Bubble
    const activeOrdersCount = await prisma.order.count({
      where: { vendorId: cart.vendorId, status: { in: ['preparing', 'ready_for_pickup', 'accepted', 'pending_vendor'] } }
    });
    fcm.updateFloatingBubble(cart.vendorId, true, activeOrdersCount);

    await fcm.sendToVendor(cart.vendorId, {
      title: 'New Order Received',
      body: `Order #${order.id.substring(0,8)} is awaiting your acceptance.`,
      orderId: order.id
    });

    // 4. Start BullMQ SLA Timer
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

    emitOrderStatusUpdate(orderId, newStatus, actorRole);
    
    if (order.customer?.profile?.firebaseUid) {
      await fcm.sendToCustomer(order.customer.profile.firebaseUid, {
        title: `Order Update: ${newStatus}`,
        body: `Your order status has changed to ${newStatus}.`,
        orderId: order.id
      });
    }

    // Analytics
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
