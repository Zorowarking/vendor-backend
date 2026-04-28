const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const { emitAccountStatusUpdate } = require('../lib/socket');

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
        vendorKyc: true,
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
    
    const vendor = await prisma.vendor.update({
      where: { id },
      data: { accountStatus: 'APPROVED' }
    });

    // Sync profile status if it exists
    if (vendor.profileId) {
      await prisma.profile.update({
        where: { id: vendor.profileId },
        data: { profileStatus: 'APPROVED' }
      }).catch(e => console.warn('Profile status sync failed:', e.message));
    }

    // Trigger real-time update
    emitAccountStatusUpdate(vendor.id, 'APPROVED');

    res.json({ success: true, message: 'Vendor approved successfully', vendor });
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

module.exports = router;
