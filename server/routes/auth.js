const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const { prisma, withRetry } = require('../lib/prisma');

/**
 * Sync User Profile
 * Fetches the user from the DB or creates a new one if it doesn't exist
 */
router.post('/sync', firebaseAuth, async (req, res) => {
  try {
    const { uid, phoneNumber } = req.user;
    
    // Handle cases where social login has no phone number
    const safePhone = phoneNumber || `none_${uid.substring(0, 10)}`;

    // Upsert the profile (create if doesn't exist, update if it does)
    const profile = await withRetry(() => prisma.profile.upsert({
      where: { firebaseUid: uid },
      update: { phoneNumber: safePhone }, // Keep phone updated
      create: {
        firebaseUid: uid,
        phoneNumber: safePhone,
        role: null,
        profileStatus: 'PENDING'
      },
      include: {
        vendor: true,
        rider: true
      }
    }));

    console.log(`[AUTH-SYNC] Success! Profile ID: ${profile.id}, Status: ${profile.profileStatus}`);

    res.json({
      success: true,
      user: {
        uid: profile.firebaseUid,
        phoneNumber: profile.phoneNumber,
        role: profile.role,
        profileStatus: profile.profileStatus
      }
    });
  } catch (error) {
    const util = require('util');
    console.error('[AUTH] Sync Error:', error);
    res.status(500).json({ success: false, error: 'Database sync failed', details: error.message });
  }
});

/**
 * Update User Role
 */
router.post('/role', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { role } = req.body;

    if (!['VENDOR', 'RIDER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    console.log(`[AUTH] Updating role for ${uid} to ${role}`);

    // Update profile role
    const profile = await withRetry(() => prisma.profile.update({
      where: { firebaseUid: uid },
      data: { role }
    }));

    // Create a skeleton record in the corresponding table if it doesn't exist
    if (role === 'VENDOR') {
      await withRetry(() => prisma.vendor.upsert({
        where: { phone: profile.phoneNumber },
        update: { profileId: profile.id },
        create: {
          profileId: profile.id,
          phone: profile.phoneNumber,
          businessName: 'My Store', // Placeholder
          ownerName: 'Vendor Owner', // Placeholder
          businessAddress: 'Address Pending' // Placeholder
        }
      }));
    } else if (role === 'RIDER') {
      await withRetry(() => prisma.rider.upsert({
        where: { phone: profile.phoneNumber },
        update: { profileId: profile.id },
        create: {
          profileId: profile.id,
          phone: profile.phoneNumber,
          fullName: 'Rider Name' // Placeholder
        }
      }));
    }
    
    res.json({
      success: true,
      user: {
        uid: profile.firebaseUid,
        phoneNumber: profile.phoneNumber,
        role: profile.role,
        profileStatus: profile.profileStatus
      }
    });
  } catch (error) {
    console.error('[AUTH] Role Update Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update role', details: error.message });
  }
});

/**
 * Mock Status Enforcement Test (Update profile status)
 */
router.post('/status-dev', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { status } = req.body;

    const profile = await prisma.profile.update({
      where: { firebaseUid: uid },
      data: { profileStatus: status }
    });

    res.json({ success: true, status: profile.profileStatus });
  } catch (error) {
    console.error('[AUTH] Sync error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

module.exports = router;
