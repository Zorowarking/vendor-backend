const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const OrderService = require('../services/orderService');
const CartService = require('../services/cartService');

const firebaseAuth = require('../middleware/auth');
const requireCustomer = require('../middleware/customer');
const guestSession = require('../middleware/guest');

/**
 * MODULE 5 — PAYMENT WEBHOOK
 */

// POST /payments/verify — payment webhook handler (SECURE)
router.post('/verify', firebaseAuth, requireCustomer, guestSession, async (req, res) => {
  const { paymentIntentId, status, deliveryPreference, addressId } = req.body;
  const customerId = req.customer.id; // Trusted DB UUID
  const guestId = req.guestId;       // From guestSession middleware

  try {
    if (status !== 'succeeded') {
      // Payment failure -> do NOT create order, keep cart intact, return error.
      console.log(`[PAYMENT] Payment failed for intent: ${paymentIntentId}`);
      return res.status(200).json({ success: false, message: 'Payment failed. Cart preserved.' });
    }

    // 1. Get the cart
    console.log('[PAYMENT] Fetching cart for customer:', customerId);
    const cart = await CartService.getCart({ customerId, guestId });
    if (!cart) {
      console.warn('[PAYMENT] Cart not found');
      return res.status(404).json({ error: 'Cart not found for customer' });
    }

    // 2. Fetch address details for the order
    console.log('[PAYMENT] Validating address:', addressId);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let address = null;
    if (uuidRegex.test(addressId)) {
        address = await prisma.address.findUnique({ where: { id: addressId } }).catch(e => {
            console.error('[PAYMENT] Address fetch error (swallowing):', e.message);
            return null;
        });
    }
    
    if (!address) {
        address = await prisma.address.findFirst({ where: { customerId } }).catch(() => null);
    }
    
    cart.deliveryAddress = address ? `${address.addressLine}, ${address.landmark || ''}` : 'Default Delivery Point';

    // 3. Create the order via OrderService
    console.log('[PAYMENT] Creating order from cart:', cart.id);
    const order = await OrderService.createOrderFromCart(
      cart, 
      customerId, 
      req.body.customerName || 'Customer', 
      deliveryPreference
    ).catch(err => {
        console.error('[PAYMENT] OrderService.createOrderFromCart CRASH:', err.message);
        throw err; // rethrow to hit main catch
    });

    console.log('[PAYMENT] Order created successfully:', order.id);
    res.json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('[PAYMENT] CRITICAL Webhook processing error:', error.message);
    if (error.stack) console.error(error.stack);
    res.status(500).json({ error: 'Failed to process payment verification', details: error.message });
  }
});

module.exports = router;
