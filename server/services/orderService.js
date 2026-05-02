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
    if (vendor.onlineStatus !== 'online' && !isOpen) {
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
        addonCharges: Number(cart.totalAddonCharges || 0),
        deliveryFee: 0,
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
            unitPrice: Number(item.unitPrice || item.price || 0),
            lineTotal: Number(item.total || 0),
            addonsSummary: item.options?.selectedAddons || []
          }))
        }
      },
      include: {
        items: true
      }
    });

    console.log('[ORDER-SERVICE] Order created:', { id: order.id, total: order.totalAmount });

    // suspicious order detection (> ₹50,000)
    const orderTotal = Number(order.totalAmount);
    if (orderTotal > 50000) {
      console.log(`[ORDER-SERVICE] Suspicious high-value order detected: ₹${orderTotal}. Flagging and cancelling.`);
      await prisma.order.update({
        where: { id: order.id },
        data: { 
          status: 'CANCELLED',
          isFlagged: true,
          isFlaggedAdmin: true,
          flagReason: `High Value Order (₹${orderTotal})`,
          statusHistory: {
            create: {
              status: 'CANCELLED',
              changedBy: 'SYSTEM',
              notes: 'Auto-cancelled: High value suspicious order detected.'
            }
          }
        }
      });

      console.log(`[ORDER-SERVICE] Creating breach record for high-value order ${order.id}`);
      try {
        const breach = await prisma.vendorBreach.create({
          data: {
            vendorId: cart.vendorId,
            orderId: order.id,
            type: 'SUSPICIOUS_ORDER',
            reason: `High value order detected (₹${orderTotal}). Automatic cancellation and flagging applied.`
          }
        });
        console.log(`[ORDER-SERVICE] Breach record created successfully: ${breach.id}`);
      } catch (err) {
        console.error(`[ORDER-SERVICE] FAILED to create breach record: ${err.message}`);
      }
    }
    
    // Log in SlaMetric table
    await prisma.vendorSlaMetric.upsert({
      where: { vendorId: cart.vendorId },
      update: { totalOrders: { increment: 1 } },
      create: { vendorId: cart.vendorId, totalOrders: 1 }
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

    // 4. Start BullMQ SLA Timer (1 minute)
    await orderSlaQueue.add('vendorSlaTimeout', 
      { orderId: order.id, type: 'vendor_accept' }, 
      { delay: 1 * 60 * 1000 }
    );

    return order;
  }

  /**
   * Update order status and notify all parties
   */
  static async updateOrderStatus(orderId, newStatus, actorRole) {
    if (newStatus === 'CANCELLED' || newStatus === 'cancelled_by_vendor' || newStatus === 'ORDER_CANCELLED') {
      try {
        const deliveryService = require('../src/modules/delivery/delivery.service');
        await deliveryService.cancelDelivery(orderId, `Order cancelled by ${actorRole}`);
      } catch (sfxErr) {
        console.warn(`[ORDER-SERVICE] Failed to cancel SFX delivery for order ${orderId}:`, sfxErr.message);
      }
    }

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
