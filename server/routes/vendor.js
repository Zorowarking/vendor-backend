const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const requireKyc = require('../middleware/kyc');
const { prisma, withRetry } = require('../lib/prisma');

const fcm = require('../lib/fcm');
const { vendorPollingQueue, orderSlaQueue } = require('../lib/bullmq');
const { emitOrderStatusUpdate, emitVendorStatusUpdate } = require('../lib/socket');

// ==========================================
// HELPER: Check if current time is within vendor's operating hours
// operatingHours is stored as JSON: { Monday: { isClosed, open: "09:00", close: "22:00" }, ... }
// ==========================================
function checkVendorOperatingHours(operatingHours) {
  if (!operatingHours) return true; // Default open if not configured
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const todayHours = operatingHours[dayName];

    if (!todayHours || todayHours.isClosed) return false; // Closed today

    const [openH, openM] = todayHours.open.split(':').map(Number);
    const [closeH, closeM] = todayHours.close.split(':').map(Number);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;

    // Handle overnight shifts (e.g., 22:00 – 02:00)
    if (closeMins < openMins) {
      return currentMins >= openMins || currentMins <= closeMins;
    }
    return currentMins >= openMins && currentMins <= closeMins;
  } catch {
    return true; // Err on side of caution
  }
}


// ==========================================
// MODULE A1: KYC Submission (Vendor)
// ==========================================
router.post('/kyc', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { govIdType, govIdUrl, businessProofType, businessProofUrl, panUrl, addressProofUrl } = req.body;

    console.log(`[VENDOR] KYC Submission attempt for UID: ${uid}`);
    console.log('[VENDOR] Payload:', JSON.stringify(req.body, null, 2));

    const profile = await withRetry(() => prisma.profile.findUnique({ where: { firebaseUid: uid }, include: { vendor: true } }));
    
    if (!profile) {
      console.error(`[VENDOR] KYC Error: Profile not found for UID ${uid}`);
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    if (!profile.vendor) {
      console.error(`[VENDOR] KYC Error: Vendor record missing for profile ${profile.id}`);
      return res.status(404).json({ error: 'Vendor record not initialized' });
    }

    // Handle initial submission
    const kycRecord = await withRetry(() => prisma.vendorKyc.create({
      data: {
        vendorId: profile.vendor.id,
        govIdType: govIdType || 'Government ID', 
        govIdUrl, 
        businessProofType: businessProofType || 'Business Proof', 
        businessProofUrl, 
        panUrl, 
        addressProofUrl
      }
    }));

    console.log(`[VENDOR] KYC record created: ${kycRecord.id}`);

    // MOCK KYC APPROVAL AUTOMATICALLY AS REQUESTED BY USER
    await withRetry(() => prisma.vendor.update({
      where: { id: profile.vendor.id },
      data: { accountStatus: 'mock_approved' } // Mock approved for development
    }));

    console.log(`[VENDOR] Vendor ${profile.vendor.id} auto-approved (mock)`);

    res.json({ success: true, message: 'KYC submitted and auto-approved for testing', kycId: kycRecord.id });
  } catch (error) {
    console.error('[VENDOR] KYC Critical Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message,
      code: error.code // Prisma error codes are useful
    });
  }
});

// ==========================================
// MODULE B1: Vendor Profile
// ==========================================
router.get('/profile', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    let profile = await withRetry(() => prisma.profile.findUnique({ 
      where: { firebaseUid: uid }, 
      include: { 
        vendor: { 
          include: { 
            bankDetails: true,
            complianceFlags: true
          } 
        } 
      } 
    }));
    
    if (!profile) {
      console.warn(`[VENDOR] Self-healing: Profile not found for UID ${uid}, creating it now`);
      await withRetry(() => prisma.profile.create({
        data: {
          firebaseUid: uid,
          phoneNumber: req.user.phoneNumber || `none_${uid.substring(0, 10)}`,
          role: 'VENDOR',
          profileStatus: 'PENDING'
        }
      }));
      profile = await withRetry(() => prisma.profile.findUnique({ 
        where: { firebaseUid: uid }, 
        include: { vendor: { include: { bankDetails: true, complianceFlags: true } } } 
      }));
    }

    // SELF-HEALING: If vendor record is missing, create it now
    if (!profile.vendor) {
      console.warn(`[VENDOR] Self-healing: Initializing missing vendor record for profile ${profile.id}`);
      await withRetry(() => prisma.vendor.create({
        data: {
          profileId: profile.id,
          phone: profile.phoneNumber,
          businessName: 'My Store',
          ownerName: 'Vendor Owner',
          businessAddress: 'Address Pending'
        }
      }));
      // Re-fetch with the new vendor record
      const updatedProfile = await withRetry(() => prisma.profile.findUnique({ 
        where: { id: profile.id }, 
        include: { vendor: { include: { bankDetails: true, complianceFlags: true } } } 
      }));
      
      if (updatedProfile) {
        // Continue with the fresh profile
        var finalProfile = updatedProfile;
      } else {
        return res.status(500).json({ error: 'Failed to initialize vendor record on retry' });
      }
    } else {
      var finalProfile = profile;
    }

    const v = finalProfile.vendor;
    
    // Transform to match frontend expectations
    const vendorResponse = {
      id: v.id,
      businessName: v.businessName,
      ownerName: v.ownerName,
      description: v.storeDescription,
      category: v.businessCategory,
      phone: v.phone,
      email: v.email,
      logo: v.logoUrl || 'https://via.placeholder.com/150',
      banner: v.bannerUrl || 'https://via.placeholder.com/800x200',
      operatingHours: v.operatingHours || 'Not configured',
      kycStatus: v.accountStatus,
      commissionModel: v.commissionModel || 'DEDUCTED',
      location: {
        address: v.businessAddress,
        latitude: parseFloat(v.latitude) || 0,
        longitude: parseFloat(v.longitude) || 0,
      },
      bankDetails: v.bankDetails ? {
        bankName: v.bankDetails.bankName,
        accountNumber: v.bankDetails.accountNumber,
        ifscCode: v.bankDetails.ifscCode,
        holderName: v.bankDetails.accountHolder,
      } : {
        bankName: 'Not set',
        accountNumber: '****',
      },
      complianceFlags: v.complianceFlags.map(f => f.reason) || []
    };

    res.json({ success: true, vendor: vendorResponse });


  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Original register route doubles as profile update
router.put('/profile', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { businessName, ownerName, address, category, description, location, operatingHours, bankData } = req.body;

    let profile = await withRetry(() => prisma.profile.findUnique({ where: { firebaseUid: uid }, include: { vendor: true } }));
    if (!profile) {
       console.warn(`[VENDOR] Self-healing: Profile not found for UID ${uid}, creating it now in PUT`);
       profile = await withRetry(() => prisma.profile.create({
         data: {
           firebaseUid: uid,
           phoneNumber: req.user.phoneNumber || `none_${uid.substring(0, 10)}`,
           role: 'VENDOR',
           profileStatus: 'PENDING'
         },
         include: { vendor: true }
       }));
    }

    // SELF-HEALING: If vendor record is missing (due to a previous timeout), create it now
    let vendor = profile.vendor;
    if (!vendor) {
      console.warn(`[VENDOR] Self-healing: Creating missing vendor record for profile ${profile.id}`);
      vendor = await withRetry(() => prisma.vendor.create({
        data: {
          profileId: profile.id,
          phone: profile.phoneNumber,
          businessName: businessName || 'New Vendor',
          ownerName: ownerName || 'Pending Registration',
          businessAddress: address || 'Pending'
        }
      }));
    }

    const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    const parsedHours = typeof operatingHours === 'string' ? JSON.parse(operatingHours) : operatingHours;

    // Proceed to update the vendor
    vendor = await withRetry(() => prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        businessName, ownerName, businessAddress: address, businessCategory: category, storeDescription: description,
        latitude: parsedLocation?.latitude || null, longitude: parsedLocation?.longitude || null,
        operatingHours: parsedHours || null,
      }
    }));

    if (bankData && bankData.accountNumber) {
      await withRetry(() => prisma.vendorBankDetails.upsert({
        where: { vendorId: vendor.id },
        update: {
          accountHolder: bankData.holderName, bankName: bankData.bankName, accountNumber: bankData.accountNumber,
          ifscCode: bankData.ifscCode, upiId: bankData.upiId || null,
        },
        create: {
          vendorId: vendor.id, accountHolder: bankData.holderName, bankName: bankData.bankName,
          accountNumber: bankData.accountNumber, ifscCode: bankData.ifscCode, upiId: bankData.upiId || null,
        }
      }));
    }
    res.json({ success: true, vendor });

  } catch (error) {
    console.error('[VENDOR] Profile update error:', error);
    res.status(500).json({ error: 'Failed', details: error.message });
  }
});


// ==========================================
// MODULE B2 & B3: Vendor Status Toggle
// ==========================================
router.put('/status/toggle', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { uid } = req.user;
    const { isOnline, dismissBubble } = req.body;

    const profile = await prisma.profile.findUnique({ where: { firebaseUid: uid }, include: { vendor: true } });
    const vendorId = profile.vendor.id;

    const activeOrdersCount = await prisma.order.count({
      where: { vendorId, status: { in: ['preparing', 'ready_for_pickup', 'accepted'] } }
    });

    if (dismissBubble) {
      if (isOnline === false) {
        const status = 'offline';
        await prisma.vendor.update({ where: { id: vendorId }, data: { onlineStatus: status } });
        await fcm.updateFloatingBubble(vendorId, false);
        emitVendorStatusUpdate(vendorId, false);
        return res.json({ success: true, status });
      } else {
        const status = 'online';
        await prisma.vendor.update({ where: { id: vendorId }, data: { onlineStatus: status } });
        await fcm.updateFloatingBubble(vendorId, true, activeOrdersCount);
        emitVendorStatusUpdate(vendorId, true);
        return res.json({ success: true, status });
      }
    }

    if (!isOnline && activeOrdersCount > 0) {
      const status = 'stop_new_orders';
      await prisma.vendor.update({ where: { id: vendorId }, data: { onlineStatus: status } });
      await vendorPollingQueue.add('checkPending', { vendorId }, { delay: 60000 });
      await fcm.updateFloatingBubble(vendorId, false);
      emitVendorStatusUpdate(vendorId, false);
      return res.json({ 
        success: true, 
        status, 
        message: 'You will stop receiving new orders. Complete current orders to go offline.' 
      });
    }

    const newStatus = isOnline ? 'online' : 'offline';
    await prisma.vendor.update({ where: { id: vendorId }, data: { onlineStatus: newStatus } });
    await fcm.updateFloatingBubble(vendorId, isOnline, activeOrdersCount);
    emitVendorStatusUpdate(vendorId, isOnline);

    res.json({ success: true, status: newStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ==========================================
// MODULE B4: Incoming Orders Management
// ==========================================

// Accept Order
router.put('/orders/:id/accept', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } });
    
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || order.vendorId !== profile.vendor.id) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'pending_vendor') return res.status(400).json({ error: 'Order already processed' });

    await prisma.order.update({
      where: { id },
      data: { status: 'accepted' }
    });

    // Schedule 5-minute SLA for preparation start
    await orderSlaQueue.add('prepareTimeout', { orderId: id, type: 'vendor_prepare_start' }, { delay: 5 * 60 * 1000 });

    emitOrderStatusUpdate(id, 'accepted', 'VENDOR');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error accepting order' });
  }
});

// Reject Order with logic
router.put('/orders/:id/reject', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, otherNotes } = req.body;
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } });

    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
    if (reason === 'other' && !otherNotes) return res.status(400).json({ error: 'Notes required when reason is "other"' });

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || order.vendorId !== profile.vendor.id) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending_vendor') return res.status(400).json({ error: 'Order already processed' });

    // Check if the vendor is within operating hours (read from their stored schedule)
    const isWithinOperatingHours = checkVendorOperatingHours(profile.vendor.operatingHours);

    if (isWithinOperatingHours) {
      // During operating hours — vendor should use "Contact Support" instead of rejecting
      return res.status(403).json({ 
        error: 'Cannot reject orders during operating hours. Use Contact Support instead.',
        code: 'WITHIN_OPERATING_HOURS'
      });
    }

    await prisma.order.update({
      where: { id },
      data: { status: 'cancelled_by_vendor', cancellationReason: reason, cancellationNote: otherNotes || null }
    });

    emitOrderStatusUpdate(id, 'cancelled_by_vendor', 'VENDOR');
    res.json({ success: true });
  } catch (error) {
    console.error('[VENDOR] Reject order error:', error);
    res.status(500).json({ error: 'Error rejecting order' });
  }
});

// Contact Support
router.put('/orders/:id/contact-support', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.order.update({
      where: { id },
      data: { status: 'pending_vendor_response' }
    });

    // Start 5 minute BullMQ timeout
    await orderSlaQueue.add('supportTimeout', { orderId: id, type: 'vendor_support' }, { delay: 5 * 60 * 1000 });
    
    // Broadcast to admin socket
    const io = require('../lib/socket').getIo();
    if (io) io.of('/admin').to('admin_global').emit('vendor_support_request', { orderId: id });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Support request failed' });
  }
});

// ==========================================
// MODULE B5: Order Status Updates
// ==========================================
router.put('/orders/:id/status', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // preparing, ready_for_pickup
    if (!['preparing', 'ready_for_pickup'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    await prisma.order.update({
      where: { id },
      data: { status }
    });

    emitOrderStatusUpdate(id, status, 'VENDOR');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Status update failed' });
  }
});

// ==========================================
// MODULE B6 & B7: Product Management & Add-ons
// ==========================================
router.get('/products/templates', firebaseAuth, async (req, res) => {
  try {
    const templates = await prisma.productTemplate.findMany();
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ error: 'Failed fetching templates' });
  }
});

router.get('/products', firebaseAuth, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } });
    if (!profile?.vendor) return res.status(404).json({ error: 'Vendor not found' });

    const products = await prisma.product.findMany({
      where: { vendorId: profile.vendor.id },
      include: { addOns: true },
      orderBy: { createdAt: 'desc' }
    });

    // B7: Vendor add-ons pricing config (mock hardcoded admin-set values for now)
    const config = { freeAddonUnitLimit: 3, perUnitCharge: 2.50 };

    const formattedProducts = products.map(p => ({
      ...p, 
      price: p.basePrice ? Number(p.basePrice) : 0, 
      type: p.productType, 
      isAvailable: p.isActive, 
      addOns: p.addOns || [], 
      config
    }));


    res.json({ success: true, products: formattedProducts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.post('/products', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } });
    const { name, description, category, type, price, isRestricted, isAvailable, addOns } = req.body;

    const createData = {
      vendorId: profile.vendor.id, 
      name, 
      description, 
      category, 
      productType: type, 
      basePrice: parseFloat(price) || 0, // EXPLICIT CAST FOR DECIMAL
      isRestricted: isRestricted === 'true' || isRestricted === true, // HANDLE STRING FORM DATA
      isActive: isAvailable !== undefined ? (isAvailable === 'true' || isAvailable === true) : true
    };


    if (addOns && Array.isArray(addOns) && addOns.length > 0) {
      createData.addOns = { create: addOns.map(addon => ({ name: addon.name, isActive: true })) };
    }

    const product = await prisma.product.create({ data: createData, include: { addOns: true } });
    res.json({ success: true, product });
  } catch (error) {
    console.error('[VENDOR] Add Product error:', error);
    res.status(500).json({ error: 'Failed to add product', details: error.message });
  }
});


router.put('/products/:id', firebaseAuth, requireKyc, async (req, res) => {
    try {
      const { id } = req.params;
      const { isAvailable, price, ...otherFields } = req.body;
      const profile = await withRetry(() => prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } }));
      
      const updateData = { ...otherFields };
      if (price !== undefined) updateData.basePrice = price;
      if (isAvailable !== undefined) updateData.isActive = isAvailable;
  
      await withRetry(() => prisma.product.updateMany({
        where: { id: id, vendorId: profile.vendor.id },
         data: updateData
      }));

  
      res.json({ success: true });
    } catch (error) {
      console.error('[VENDOR] Update Product error:', error);
      res.status(500).json({ error: 'Failed to update product', details: error.message });
    }
});


router.delete('/products/:id', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } });
    await prisma.product.deleteMany({ where: { id: req.params.id, vendorId: profile.vendor.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ==========================================
// MODULE B8: Earnings
// ==========================================
router.get('/earnings', firebaseAuth, requireKyc, async (req, res) => {
  try {
    const { period } = req.query; // daily, weekly, monthly
    const profile = await prisma.profile.findUnique({ where: { firebaseUid: req.user.uid }, include: { vendor: true } });
    
    // Use raw query or aggregate for sums (Simulated DB grouping here)
    const earnings = await prisma.vendorEarning.aggregate({
      _sum: { orderTotal: true, commissionAmt: true, vendorPayout: true },
      _count: { orderId: true },
      where: { vendorId: profile.vendor.id } // apply date filters based on period
    });

    res.json({
      success: true,
      revenue: parseFloat(earnings._sum.orderTotal || 0),
      commission: parseFloat(earnings._sum.commissionAmt || 0),
      net: parseFloat(earnings._sum.vendorPayout || 0),
      orderCount: earnings._count.orderId || 0,
      chartData: { labels: ['Mon','Tue','Wed'], datasets: [{ data: [10,20,30] }] }, // Mocked analytics shape for chart kit
      breakdown: [] // Mocked List
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

module.exports = router;
