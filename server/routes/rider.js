const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const requireKyc = require('../middleware/kyc');
const { prisma, withRetry } = require('../lib/prisma');
const fcm = require('../lib/fcm');
const { riderPollingQueue } = require('../lib/bullmq');
const { emitOrderStatusUpdate } = require('../lib/socket');

// ==========================================
// MODULE A1: KYC Submission (Rider)
// ==========================================
router.post('/kyc', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { govIdType, govIdUrl, drivingLicenseUrl, vehicleRegUrl } = req.body;

    console.log(`[RIDER] KYC Submission attempt for UID: ${uid}`);
    console.log('[RIDER] Payload:', JSON.stringify(req.body, null, 2));

    const profile = await withRetry(() => prisma.profile.findUnique({ where: { firebaseUid: uid }, include: { rider: true } }));
    
    if (!profile) {
      console.error(`[RIDER] KYC Error: Profile not found for UID ${uid}`);
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    if (!profile.rider) {
      console.error(`[RIDER] KYC Error: Rider record missing for profile ${profile.id}`);
      return res.status(404).json({ error: 'Rider record not initialized' });
    }

    const kycRecord = await withRetry(() => prisma.riderKyc.create({
      data: {
        riderId: profile.rider.id, 
        govIdType: govIdType || 'Government ID', 
        govIdUrl, 
        drivingLicenseUrl, 
        vehicleRegUrl
      }
    }));

    console.log(`[RIDER] KYC record created: ${kycRecord.id}`);

    // MOCK KYC APPROVAL AUTOMATICALLY
    await withRetry(() => prisma.rider.update({
      where: { id: profile.rider.id },
      data: { accountStatus: 'mock_approved' }
    }));

    console.log(`[RIDER] Rider ${profile.rider.id} auto-approved (mock)`);

    res.json({ success: true, message: 'KYC submitted and auto-approved for testing', kycId: kycRecord.id });
  } catch (error) {
    console.error('[RIDER] KYC Critical Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message,
      code: error.code
    });
  }
});

// ==========================================
// MODULE C1: Rider Profile
// ==========================================
router.get('/profile', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const profile = await withRetry(() => prisma.profile.findUnique({ 
      where: { firebaseUid: uid }, 
      include: { rider: { include: { bankDetails: true } } } 
    }));
    if (!profile || !profile.rider) return res.status(404).json({ error: 'Rider not found' });
    res.json({ success: true, rider: profile.rider });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

router.put('/profile', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { fullName, vehicleType, vehicleNumber, preferredZone, bankData } = req.body;

    const profile = await withRetry(() => prisma.profile.findUnique({ where: { firebaseUid: uid }, include: { rider: true } }));
    const rider = await withRetry(() => prisma.rider.update({
      where: { id: profile.rider.id },
      data: { fullName, vehicleType, vehicleNumber, preferredZone }
    }));

    if (bankData && bankData.accountNumber) {
      await prisma.riderBankDetails.upsert({
        where: { riderId: rider.id },
        update: { accountHolder: bankData.holderName, bankName: bankData.bankName, accountNumber: bankData.accountNumber, ifscCode: bankData.ifscCode },
        create: { riderId: rider.id, accountHolder: bankData.holderName, bankName: bankData.bankName, accountNumber: bankData.accountNumber, ifscCode: bankData.ifscCode }
      });
    }

    res.json({ success: true, rider });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ==========================================
// MODULE C2: Rider Status Toggle
// ==========================================
router.put('/status/toggle', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { uid } = req.user;
    const { isOnline } = req.body;

    const profile = await prisma.profile.findUnique({ where: { firebaseUid: uid }, include: { rider: true } });
    const riderId = profile.rider.id;

    const activeDeliveriesCount = await prisma.order.count({
      where: { riderId, status: { in: ['on_the_way_to_pickup', 'order_picked_up', 'out_for_delivery'] } }
    });

    if (!isOnline && activeDeliveriesCount > 0) {
      await prisma.rider.update({ where: { id: riderId }, data: { onlineStatus: 'stop_new_orders' } });
      await riderPollingQueue.add('checkPending', { riderId }, { delay: 60000 });
      return res.json({ success: true, status: 'stop_new_orders', message: 'You will stop receiving new orders. Complete current deliveries against going offline.' });
    }

    const newStatus = isOnline ? 'online' : 'offline';
    await prisma.rider.update({ where: { id: riderId }, data: { onlineStatus: newStatus } });

    res.json({ success: true, status: newStatus });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ==========================================
// MODULE C3: Pickup Request Handling
// ==========================================
router.get('/requests', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { rider: true } });
    const requests = await prisma.pickupRequest.findMany({
      where: { riderId: profile.rider.id, status: 'broadcast' },
      include: { order: true } // Order relation is now properly defined in schema
    });
    res.json({ success: true, requests });
  } catch (error) {
    console.error('[RIDER] Get requests error:', error);
    res.status(500).json({ error: 'Failed to fetch pickup requests' });
  }
});

router.put('/requests/:id/accept', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { rider: true } });
    const requestId = req.params.id;

    // Use transaction to ensure atomic assignment
    const assignedOrder = await prisma.$transaction(async (tx) => {
      const request = await tx.pickupRequest.findUnique({ where: { id: requestId } });
      if (!request || request.status !== 'broadcast') throw new Error('CONFLICT');
      
      const order = await tx.order.findUnique({ where: { id: request.orderId } });
      if (order.riderId) throw new Error('CONFLICT'); // Already assigned

      await tx.pickupRequest.update({ where: { id: requestId }, data: { status: 'accepted', respondedAt: new Date() } });
      // Reject others
      await tx.pickupRequest.updateMany({ where: { orderId: order.id, id: { not: requestId } }, data: { status: 'missed' } });

      await tx.order.update({ where: { id: order.id }, data: { riderId: profile.rider.id, status: 'on_the_way_to_pickup' } });

      // LOG STATUS HISTORY
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'on_the_way_to_pickup',
          changedBy: `RIDER_${profile.rider.id}`
        }
      });

      return order;
    });

    emitOrderStatusUpdate(assignedOrder.id, 'on_the_way_to_pickup', 'RIDER');
    res.json({ success: true, order: assignedOrder });
  } catch (error) {
    if (error.message === 'CONFLICT') return res.status(409).json({ error: 'Order already accepted by another rider' });
    res.status(500).json({ error: 'Failed' });
  }
});

router.put('/requests/:id/reject', firebaseAuth, requireKyc, async (req, res) => {
  try {
    await prisma.pickupRequest.update({ where: { id: req.params.id }, data: { status: 'rejected', respondedAt: new Date() } });
    res.json({ success: true });
    // TODO: Re-broadcast logic to next rider 
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ==========================================
// MODULE C4: Delivery Status Updates
// ==========================================
router.put('/orders/:id/status', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['on_the_way_to_pickup', 'order_picked_up', 'out_for_delivery', 'delivered', 'address_not_found', 'customer_denied_delivery'];
    
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid' });

    const order = await prisma.order.update({ where: { id }, data: { status } });
    
    // LOG STATUS HISTORY
    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status: status,
        changedBy: `RIDER_${req.user.uid}`
      }
    });

    if (status === 'delivered') {
      // Create rider earning record
      const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { rider: true } });
      await prisma.riderEarning.create({
        data: {
          riderId: profile.rider.id, orderId: id, fixedFee: 5.0, distanceFee: 2.5, totalPayout: 7.5
        }
      });
      // trigger analytics event logic
    }

    emitOrderStatusUpdate(id, status, 'RIDER');
    fcm.sendPushNotification(order.customerFcmToken, 'Order Update', `Your order is now ${status}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ==========================================
// MODULE C5: Live Location Streaming
// ==========================================
router.post('/location', firebaseAuth, async (req, res) => {
  try {
    const { lat, lng, orderId } = req.body;
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { rider: true } });
    
    await prisma.rider.update({ where: { id: profile.rider.id }, data: { currentLat: lat, currentLng: lng } });
    
    if (orderId) {
      // LOG COORDINATES TO DATABASE (Breadcrumbs)
      await prisma.orderTracking.create({
        data: {
          orderId: orderId,
          latitude: lat,
          longitude: lng
        }
      }).catch(err => console.error('[TRACKING-LOG] Failed to save coordinate:', err.message));

      const { emitLocationUpdate } = require('../lib/socket');
      emitLocationUpdate(orderId, lat, lng);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Location stream failed' });
  }
});

// ==========================================
// MODULE C6: Rider Earnings
// ==========================================
router.get('/earnings', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { rider: true } });
    
    const earnings = await prisma.riderEarning.aggregate({
      _sum: { totalPayout: true, fixedFee: true, distanceFee: true },
      _count: { orderId: true },
      where: { riderId: profile.rider.id }
    });

    res.json({
      success: true,
      revenue: parseFloat(earnings._sum.totalPayout || 0),
      orderCount: earnings._count.orderId || 0,
      chartData: { labels: ['Mon','Tue','Wed'], datasets: [{ data: [15,25,35] }] },
      breakdown: []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

module.exports = router;
