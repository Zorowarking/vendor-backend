const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const requireCustomer = require('../middleware/customer');
const CartService = require('../services/cartService');
const { prisma } = require('../lib/prisma');
const shadowfaxService = require('../src/modules/delivery/shadowfax/shadowfax.service');
const env = require('../src/config/env');

/**
 * MODULE 5 — ORDER & PAYMENT
 */

// POST /orders — initiate payment, validate cart, age verification, guest login
router.post('/checkout', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { deliveryPreference, addressId } = req.body;

    // 1. Validate Guest Login - enforce logged in status at checkout (already done via firebaseAuth + requireCustomer)
    
    // 2. Delivery preference must be explicitly set
    if (!deliveryPreference) {
      return res.status(400).json({ error: 'Delivery preference must be explicitly selected.' });
    }

    // 3. Get Cart
    const cart = await CartService.getCart({ customerId: req.customer.id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // VENDOR GATEKEEPER CHECK (Pre-Payment)
    const vendor = await prisma.vendor.findUnique({ where: { id: cart.vendorId } });
    if (!vendor || vendor.onlineStatus !== 'online') {
      return res.status(403).json({ 
        error: 'VENDOR_OFFLINE', 
        message: 'This vendor is currently offline and not accepting orders.' 
      });
    }

    // Only check operating hours if not explicitly 'online' (though onlineStatus check above already covers this for now)
    // We prioritize manual 'online' status as a force-open override.
    const { checkVendorAvailability } = require('../lib/availability');
    const { isOpen, nextOpen } = checkVendorAvailability(vendor.operatingHours);
    
    if (vendor.onlineStatus !== 'online' && !isOpen) {
      return res.status(403).json({ 
        error: 'VENDOR_CLOSED', 
        message: `This vendor is currently closed. They will be back online ${nextOpen || 'soon'}.`
      });
    }

    // 4. Validate Age Verification for restricted products
    const hasRestrictedProducts = cart.items.some(item => {
        // We'd need to check the product record or the flag on cart item
        return item.ageVerified === false; // If any item marked as restricted but missing verification in cart
    });

    if (hasRestrictedProducts) {
        // Check profile verification (Synchronized with 30-day window stored in DB)
        const verification = req.customer.ageVerification;
        const now = new Date();

        if (!verification || new Date(verification.expiresAt) < now) {
            console.log(`[CHECKOUT] Age verification failed for ${req.customer.id}. Record: ${!!verification}`);
            return res.status(403).json({ 
                error: 'AGE_VERIFICATION_REQUIRED', 
                message: 'Age verification expired or missing. Please verify to purchase restricted products.' 
            });
        }
    }

    // 5. Validate Address
    // Validate if it's a UUID string to prevent Prisma crash
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(addressId)) {
        return res.status(400).json({ error: 'Invalid address ID format' });
    }
    const address = await prisma.address.findUnique({ where: { id: addressId, customerId: req.customer.id } });

    if (!address) return res.status(400).json({ error: 'Valid delivery address required' });

    // SFX Serviceability Check
    let deliveryCost = 0;
    
    if (env.USE_SANDBOX_PAYMENTS) {
      console.log('[CHECKOUT] Sandbox mode: Skipping real SFX serviceability check.');
      deliveryCost = 40.00; // Mock delivery fee for sandbox
    } else {
      try {
        const sfxResponse = await shadowfaxService.checkServiceability({
          storeCode: vendor.sfxStoreCode || env.SFX_STORE_CODE,
          orderValue: cart.total,
          paid: true,
          dropLat: address.latitude ? Number(address.latitude) : undefined,
          dropLng: address.longitude ? Number(address.longitude) : undefined
        });
        
        if (sfxResponse && sfxResponse.available_rider_count === 0) {
          return res.status(422).json({ 
            error: 'DELIVERY_UNAVAILABLE', 
            message: 'Shadowfax has no available riders in this area right now.' 
          });
        }
        
        if (sfxResponse && sfxResponse.delivery_cost) {
          deliveryCost = sfxResponse.delivery_cost;
        }
      } catch (error) {
        console.warn('[CHECKOUT] Shadowfax serviceability check failed:', error.message);
        // If store code is missing, it's a configuration error
        if (!vendor.sfxStoreCode && !env.SFX_STORE_CODE) {
          return res.status(500).json({ error: 'DELIVERY_CONFIG_ERROR', message: 'Vendor delivery not configured.' });
        }
      }
    }

    // 6. Initiate Payment (Sandbox or Real)
    let paymentData = {
      success: true,
      amount: cart.total,
      deliveryFee: deliveryCost,
      totalToPay: cart.total + deliveryCost,
      currency: 'INR',
      clientSecret: 'mock_secret_123',
    };

    if (env.USE_SANDBOX_PAYMENTS) {
      const sandboxPaymentService = require('../services/sandboxPaymentService');
      const sandboxIntent = sandboxPaymentService.createPaymentIntent(
        cart.total + deliveryCost,
        req.customer.id,
        cart.vendorId
      );
      paymentData.paymentIntentId = sandboxIntent.id;
      paymentData.isSandbox = true;
      paymentData.message = 'Sandbox payment initiated.';
    } else {
      // In real app, call Stripe/Razorpay here
      paymentData.paymentIntentId = `pi_${Math.random().toString(36).substring(7)}`;
      paymentData.message = 'Payment initiated. Awaiting confirmation.';
    }
    
    res.json(paymentData);

  } catch (error) {
    console.error('[CHECKOUT] error:', error);
    res.status(500).json({ error: 'Checkout initiation failed' });
  }
});

/**
 * POST /orders/validate-delivery
 * Pre-checkout serviceability check for Shadowfax
 */
router.post('/validate-delivery', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { addressId } = req.body;
    
    const cart = await CartService.getCart({ customerId: req.customer.id });
    if (!cart) return res.status(404).json({ error: 'Cart empty' });

    const vendor = await prisma.vendor.findUnique({ where: { id: cart.vendorId } });
    const address = await prisma.address.findUnique({ where: { id: addressId, customerId: req.customer.id } });

    if (!vendor || !address) return res.status(400).json({ error: 'Invalid vendor or address' });

    try {
      const sfxResponse = await shadowfaxService.checkServiceability({
        storeCode: vendor.sfxStoreCode || env.SFX_STORE_CODE,
        orderValue: cart.total,
        dropLat: Number(address.latitude),
        dropLng: Number(address.longitude)
      });

      res.json({
        success: true,
        isServiceable: sfxResponse.available_rider_count > 0,
        riderCount: sfxResponse.available_rider_count,
        deliveryFee: sfxResponse.delivery_cost || 0,
        eta: sfxResponse.eta || null
      });
    } catch (sfxErr) {
      res.status(422).json({ 
        success: false, 
        error: 'SFX_CHECK_FAILED', 
        message: sfxErr.message 
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

// GET /orders — customer order history
router.get('/', firebaseAuth, async (req, res) => {
  try {
    // If not authenticated via Firebase, or no customer record exists, return empty list
    if (!req.user?.uid) {
      return res.json({ success: true, orders: [] });
    }

    const profile = await prisma.profile.findUnique({
      where: { firebaseUid: req.user.uid },
      include: { customer: true }
    });

    if (!profile || profile.role !== 'CUSTOMER' || !profile.customer) {
      return res.json({ success: true, orders: [] });
    }

    const orders = await prisma.order.findMany({
      where: { customerId: profile.customer.id },
      include: { 
        vendor: {
            select: { businessName: true, logoUrl: true }
        },
        items: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, orders });
  } catch (error) {
    console.error('[ORDERS-FETCH] 500 Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch order history', 
      details: error.message
    });
  }
});

// GET /orders/:id — order detail and current status
router.get('/:id', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id, customerId: req.customer.id },
      include: { 
        vendor: true, 
        rider: true,
        items: true,
        statusHistory: {
            orderBy: { changedAt: 'asc' }
        },
        tracking: {
            orderBy: { recordedAt: 'asc' }
        }
      }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

/**
 * MODULE 7 — LIVE ORDER TRACKING
 */
router.get('/:id/tracking', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id, customerId: req.customer.id },
      include: { rider: true }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.riderId) return res.status(200).json({ success: true, status: order.status, message: 'Rider not yet assigned' });

    res.json({
      success: true,
      status: order.status,
      rider: {
        name: order.rider.fullName,
        phone: order.rider.phone,
        location: {
          lat: Number(order.rider.latitude),
          lng: Number(order.rider.longitude)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tracking info' });
  }
});

module.exports = router;
