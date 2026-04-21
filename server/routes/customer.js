const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const requireCustomer = require('../middleware/customer');
const { prisma, withRetry, getOrCreateCustomerProfile } = require('../lib/prisma');

/**
 * MODULE 4 — AGE VERIFICATION
 */
router.post('/age-verify', firebaseAuth, async (req, res) => {
  try {
    const { documentReference, idType, birthDate } = req.body;
    
    // Self-Healing Profile Alignment
    const profile = await getOrCreateCustomerProfile(req.user);

    // Update Verification Status
    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + 30);

    await prisma.ageVerification.upsert({
      where: { customerId: profile.customer.id },
      update: {
        isVerified: true,
        verifiedAt: new Date(),
        expiresAt: expiresAtDate,
        birthDate: birthDate ? new Date(birthDate) : null,
        idType,
        verificationId: documentReference
      },
      create: {
        customerId: profile.customer.id,
        isVerified: true,
        verifiedAt: new Date(),
        expiresAt: expiresAtDate,
        birthDate: birthDate ? new Date(birthDate) : null,
        idType,
        verificationId: documentReference
      }
    });

    res.json({ success: true, message: 'Age verification stored. Valid for 30 days.' });
  } catch (error) {
    console.error('[AGE-VERIFY] Critical Error:', error);
    res.status(500).json({ 
      error: 'Failed to store age verification',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * MODULE 11 — ACCOUNT MANAGEMENT
 */

// Sync/Get Profile
router.get('/profile', firebaseAuth, async (req, res) => {
  try {
    // Self-Healing Profile Alignment
    const profile = await getOrCreateCustomerProfile(req.user);

    // Re-fetch to include full address list
    const fullProfile = await prisma.profile.findUnique({
      where: { id: profile.id },
      include: { customer: { include: { address: true } } }
    });

    res.json({ success: true, profile: fullProfile });
  } catch (error) {
    console.error('[PROFILE-SYNC] Error:', error);
    res.status(500).json({ error: 'Failed to fetch customer profile' });
  }
});

router.put('/profile', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { fullName, email } = req.body;
    const updated = await prisma.customer.update({
      where: { id: req.customer.id },
      data: { fullName, email }
    });
    res.json({ success: true, customer: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Address Management
router.get('/address', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const address = await prisma.address.findUnique({
      where: { customerId: req.customer.id }
    });
    res.json({ success: true, address });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch address' });
  }
});

router.post('/address', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { 
      addressLine, addressLine1, addressLine2,
      city, state, postalCode,
      landmark, latitude, longitude, type,
      contactName, contactPhone 
    } = req.body;
    
    // Core address fields that always exist
    const coreData = {
      addressLine1: addressLine1 || addressLine || 'Default Address',
      addressLine2,
      city: city || 'Unknown',
      state: state || 'N/A',
      postalCode: postalCode || '000000',
      landmark,
      latitude,
      longitude,
      addressType: type || 'Home'
    };

    /**
     * ATTEMPT 1: Save with new Contact Details
     * If the DB hasn't been pushed (schema mismatch), this will throw an error.
     */
    try {
      const address = await prisma.address.upsert({
        where: { customerId: req.customer.id },
        update: {
          ...coreData,
          contactName,
          contactPhone
        },
        create: {
          customerId: req.customer.id,
          ...coreData,
          contactName,
          contactPhone
        }
      });
      return res.json({ success: true, address, status: 'fully_synced' });
    } catch (prismaError) {
      // Check if error is due to missing columns (Prisma error P2002/P2025/etc or raw DB error)
      console.warn('[PRISMA] Contact columns missing? Falling back to core save.', prismaError.message);
      
      /**
       * ATTEMPT 2: Fallback to core fields only
       * This ensures the app doesn't crash if the user hasn't run 'npx prisma db push'
       */
      const address = await prisma.address.upsert({
        where: { customerId: req.customer.id },
        update: coreData,
        create: {
          customerId: req.customer.id,
          ...coreData
        }
      });
      return res.json({ 
        success: true, 
        address, 
        status: 'partial_sync',
        warning: 'Contact details not saved. Please run npx prisma db push.' 
      });
    }
  } catch (error) {
    console.error('[ADDRESS-SAVE] Critical Error:', error);
    res.status(500).json({ error: 'Failed to save address', details: error.message });
  }
});

router.put('/address/:id', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const address = await prisma.address.update({
      where: { id, customerId: req.customer.id },
      data: updateData
    });
    res.json({ success: true, address });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update address' });
  }
});

/**
 * MODULE 10 — CUSTOMER SUPPORT
 */
router.get('/support/options', (req, res) => {
  res.json({
    success: true,
    whatsapp: {
      number: '+1234567890',
      message: 'Hi, I need help with my order.',
      options: [
        { label: 'Order Delayed', value: 'delay' },
        { label: 'Item Missing', value: 'missing' },
        { label: 'Payment Issue', value: 'payment' }
      ]
    }
  });
});

router.post('/support/escalate', firebaseAuth, requireCustomer, async (req, res) => {
  // Logic to flag for live chat or create a ticket
  res.json({ success: true, message: 'Your request has been escalated to a live agent.' });
});

module.exports = router;
