const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const { emitAccountStatusUpdate, emitProductStatusUpdate } = require('../lib/socket');

// Middleware to simulate admin check (in production, use roles)
const requireAdmin = (req, res, next) => {
  // Simple check for now - can be expanded to check firebase token for admin claim
  next();
};

/**
 * GET /api/admin/vendors/pending
 * List all vendors waiting for KYC approval
 */
router.get('/vendors/pending', requireAdmin, async (req, res) => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: {
        accountStatus: {
          in: ['KYC_SUBMITTED', 'UNDER_REVIEW', 'PENDING']
        }
      },
      include: {
        kyc: true,
        bankDetails: true
      }
    });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending vendors' });
  }
});

/**
 * PUT /api/admin/vendors/:id/approve
 * Approve a vendor account
 */
router.put('/vendors/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch vendor details for SFX registration
    const vendorData = await prisma.vendor.findUnique({ where: { id } });
    if (!vendorData) return res.status(404).json({ error: 'Vendor not found' });

    // 2. Automated Shadowfax Store Creation (if not already created)
    let sfxStoreCode = vendorData.sfxStoreCode;
    if (!sfxStoreCode && vendorData.latitude && vendorData.longitude) {
      try {
        const shadowfaxService = require('../src/modules/delivery/shadowfax/shadowfax.service');
        const sfxResult = await shadowfaxService.createStore({
          name: vendorData.businessName,
          contactName: vendorData.ownerName,
          contactNumber: vendorData.phone,
          address: vendorData.businessAddress,
          pincode: vendorData.pincode || '110001',
          city: vendorData.city || 'Default',
          latitude: Number(vendorData.latitude),
          longitude: Number(vendorData.longitude)
        });
        sfxStoreCode = sfxResult.store_code;
        console.log(`[ADMIN] Shadowfax store created for vendor ${id}: ${sfxStoreCode}`);
      } catch (sfxErr) {
        console.error(`[ADMIN] Shadowfax store creation failed for vendor ${id}:`, sfxErr.message);
        // We continue with approval but the vendor will need manual store code entry later
      }
    }

    const updatedVendor = await prisma.vendor.update({
      where: { id },
      data: { 
        accountStatus: 'APPROVED',
        sfxStoreCode: sfxStoreCode
      }
    });

    // Sync profile status if it exists
    if (updatedVendor.profileId) {
      await prisma.profile.update({
        where: { id: updatedVendor.profileId },
        data: { profileStatus: 'APPROVED' }
      }).catch(e => console.warn('Profile status sync failed:', e.message));
    }

    // Trigger real-time update
    emitAccountStatusUpdate(updatedVendor.id, 'APPROVED');

    res.json({ success: true, message: 'Vendor approved successfully', vendor: updatedVendor });
  } catch (error) {
    res.status(500).json({ error: 'Approval failed', details: error.message });
  }
});

/**
 * PUT /api/admin/vendors/:id/reject
 * Reject a vendor account
 */
router.put('/vendors/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const vendor = await prisma.vendor.update({
      where: { id },
      data: { accountStatus: 'REJECTED' }
    });

    // Trigger real-time update
    emitAccountStatusUpdate(vendor.id, 'REJECTED');

    res.json({ success: true, message: 'Vendor rejected', reason });
  } catch (error) {
    res.status(500).json({ error: 'Rejection failed' });
  }
});

/**
 * PRODUCT MANAGEMENT (ADMIN)
 */

// List all products pending review
router.get('/products/pending', requireAdmin, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { reviewStatus: 'pending_review' },
      include: { 
        addOns: true, 
        images: true,
        vendor: true,
        customizationGroups: {
          include: { options: true }
        }
      }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending products' });
  }
});

// Approve/Reject a product
router.put('/products/:id/review', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // APPROVED, REJECTED
    
    const product = await prisma.product.update({
      where: { id },
      data: { 
        reviewStatus: status,
        isActive: status === 'APPROVED' // Auto-activate if approved
      }
    });

    emitProductStatusUpdate(product.vendorId, id, status);

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ error: 'Product review update failed' });
  }
});

// Admin direct edit of a product's customization
router.put('/products/:id/customization', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { customizationGroups } = req.body;

    await prisma.$transaction(async (tx) => {
      await tx.customizationGroup.deleteMany({ where: { productId: id } });
      if (Array.isArray(customizationGroups) && customizationGroups.length > 0) {
        await tx.product.update({
          where: { id },
          data: {
            customizationGroups: {
              create: customizationGroups.map((group, gIdx) => ({
                name: group.name,
                isRequired: group.isRequired === true,
                selectionType: group.selectionType || 'SINGLE',
                maxSelections: group.maxSelections || null,
                displayOrder: group.displayOrder ?? gIdx,
                options: {
                  create: (group.options || []).map((opt, oIdx) => ({
                    name: opt.name,
                    priceModifier: parseFloat(opt.priceModifier) || 0,
                    isAvailable: opt.isAvailable !== false,
                    displayOrder: opt.displayOrder ?? oIdx,
                    allowQuantity: !!opt.allowQuantity,
                    freeLimit: parseInt(opt.freeLimit) || 0
                  }))
                }
              }))
            }
          }
        });
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Admin product update failed' });
  }
});

// Admin broadcast notification to users
router.post('/broadcast-notification', requireAdmin, async (req, res) => {
  try {
    const { audience, title, message, dataPayload } = req.body;
    
    // Validate audience
    if (!['VENDORS', 'CUSTOMERS', 'ALL'].includes(audience)) {
      return res.status(400).json({ error: 'Invalid audience. Must be VENDORS, CUSTOMERS, or ALL' });
    }

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const fcm = require('../lib/fcm');
    const result = await fcm.broadcastToUsers(audience, {
      title,
      body: message,
      type: 'admin_broadcast',
      data: dataPayload || {}
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('[ADMIN] Broadcast error:', error);
    res.status(500).json({ error: 'Failed to send broadcast notification' });
  }
});

/**
 * POST /api/admin/customer/:id/suspend
 * Suspend a customer account forever
 */
router.post('/customer/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params; // customer ID
    
    // Find customer's profile
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!customer || !customer.profileId) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    const updatedProfile = await prisma.profile.update({
      where: { id: customer.profileId },
      data: { profileStatus: 'SUSPENDED' }
    });

    try {
      emitAccountStatusUpdate(customer.id, 'SUSPENDED');
    } catch (_) {}

    res.json({ success: true, message: 'Customer suspended forever', profile: updatedProfile });
  } catch (error) {
    res.status(500).json({ error: 'Suspension failed', details: error.message });
  }
});

/**
 * POST /api/admin/customer/:id/disable
 * Disable a customer account temporarily for a specific number of hours
 */
router.post('/customer/:id/disable', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { hours } = req.body;
    
    if (!hours || isNaN(hours) || Number(hours) <= 0) {
      return res.status(400).json({ error: 'Valid temporary duration (hours) is required' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!customer || !customer.profileId) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    const disabledUntil = new Date(Date.now() + Number(hours) * 60 * 60 * 1000).toISOString();
    const statusString = `DISABLED:${disabledUntil}`;

    const updatedProfile = await prisma.profile.update({
      where: { id: customer.profileId },
      data: { profileStatus: statusString }
    });

    try {
      emitAccountStatusUpdate(customer.id, statusString);
    } catch (_) {}

    res.json({ 
      success: true, 
      message: `Customer disabled for ${hours} hours`, 
      disabledUntil,
      profile: updatedProfile 
    });
  } catch (error) {
    res.status(500).json({ error: 'Disabling failed', details: error.message });
  }
});

/**
 * POST /api/admin/customer/:id/enable
 * Enable a suspended/disabled customer account back to APPROVED/ACTIVE
 */
router.post('/customer/:id/enable', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!customer || !customer.profileId) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    const updatedProfile = await prisma.profile.update({
      where: { id: customer.profileId },
      data: { profileStatus: 'APPROVED' }
    });

    try {
      emitAccountStatusUpdate(customer.id, 'APPROVED');
    } catch (_) {}

    res.json({ success: true, message: 'Customer account enabled successfully', profile: updatedProfile });
  } catch (error) {
    res.status(500).json({ error: 'Enabling failed', details: error.message });
  }
});

/**
 * POST /api/admin/vendor/:id/suspend
 * Suspend a vendor account forever
 */
router.post('/vendor/:id/suspend', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params; // vendor ID
    
    // Find vendor's profile
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!vendor || !vendor.profileId) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const updatedProfile = await prisma.profile.update({
      where: { id: vendor.profileId },
      data: { profileStatus: 'SUSPENDED' }
    });

    try {
      emitAccountStatusUpdate(vendor.id, 'SUSPENDED');
    } catch (_) {}

    res.json({ success: true, message: 'Vendor suspended forever', profile: updatedProfile });
  } catch (error) {
    res.status(500).json({ error: 'Suspension failed', details: error.message });
  }
});

/**
 * POST /api/admin/vendor/:id/disable
 * Disable a vendor account temporarily for a specific number of hours
 */
router.post('/vendor/:id/disable', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { hours } = req.body;
    
    if (!hours || isNaN(hours) || Number(hours) <= 0) {
      return res.status(400).json({ error: 'Valid temporary duration (hours) is required' });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!vendor || !vendor.profileId) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const disabledUntil = new Date(Date.now() + Number(hours) * 60 * 60 * 1000).toISOString();
    const statusString = `DISABLED:${disabledUntil}`;

    const updatedProfile = await prisma.profile.update({
      where: { id: vendor.profileId },
      data: { profileStatus: statusString }
    });

    try {
      emitAccountStatusUpdate(vendor.id, statusString);
    } catch (_) {}

    res.json({ 
      success: true, 
      message: `Vendor disabled for ${hours} hours`, 
      disabledUntil,
      profile: updatedProfile 
    });
  } catch (error) {
    res.status(500).json({ error: 'Disabling failed', details: error.message });
  }
});

/**
 * POST /api/admin/vendor/:id/enable
 * Enable a suspended/disabled vendor account back to APPROVED/ACTIVE
 */
router.post('/vendor/:id/enable', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!vendor || !vendor.profileId) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const updatedProfile = await prisma.profile.update({
      where: { id: vendor.profileId },
      data: { profileStatus: 'APPROVED' }
    });

    try {
      emitAccountStatusUpdate(vendor.id, 'APPROVED');
    } catch (_) {}

    res.json({ success: true, message: 'Vendor account enabled successfully', profile: updatedProfile });
  } catch (error) {
    res.status(500).json({ error: 'Enabling failed', details: error.message });
  }
});

module.exports = router;
