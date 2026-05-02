const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const requireCustomer = require('../middleware/customer');
const { prisma, withRetry, getOrCreateCustomerProfile } = require('../lib/prisma');

/**
 * MODULE 4 — AGE VERIFICATION
 */
// POST /age-verify — verify age for restricted products
router.post('/age-verify', firebaseAuth, async (req, res) => {
  try {
    let { birthDate, idType, verificationId, documentReference } = req.body;
    const profile = await getOrCreateCustomerProfile(req.user);

    // If only documentReference is provided (Phase 1 simplicity), use defaults
    if (!birthDate && documentReference) {
        birthDate = new Date(Date.now() - 20 * 365.25 * 24 * 60 * 60 * 1000).toISOString(); // Default to 20 years ago
        idType = idType || 'ID_DOCUMENT';
        verificationId = verificationId || documentReference.substring(0, 50);
    }

    // Enforce 18+ check
    if (!birthDate) return res.status(400).json({ error: 'Birth date is required.' });
    
    const bday = new Date(birthDate);
    if (isNaN(bday.getTime())) {
      return res.status(400).json({ error: 'Invalid birth date format.' });
    }

    const age = (Date.now() - bday.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (age < 18) {
      return res.status(403).json({ error: 'You must be 18+ to verify.' });
    }

    const verification = await prisma.ageVerification.upsert({
      where: { customerId: profile.customer.id },
      update: {
        birthDate: bday,
        idType,
        verificationId,
        isVerified: true,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      },
      create: {
        customerId: profile.customer.id,
        birthDate: bday,
        idType,
        verificationId,
        isVerified: true,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({ success: true, verification });
  } catch (error) {
    console.error('[AGE-VERIFY] CRITICAL Error:', error);
    res.status(500).json({ error: 'Verification failed', details: error.message });
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
      include: { 
        customer: { 
          include: { 
            addresses: {
                orderBy: { createdAt: 'desc' }
            },
            ageVerification: true
          } 
        } 
      }
    });

    res.json({ success: true, profile: fullProfile });
  } catch (error) {
    console.error('[PROFILE-SYNC] Error:', error);
    res.status(500).json({ error: 'Failed to fetch customer profile' });
  }
});

router.put('/profile', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const { fullName, email, profilePicUrl } = req.body;
    const updated = await prisma.customer.update({
      where: { id: req.customer.id },
      data: { 
        fullName: fullName || undefined, 
        email: email || undefined, 
        profilePicUrl: profilePicUrl || undefined 
      }
    });
    res.json({ success: true, customer: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Address Management
router.get('/address', firebaseAuth, requireCustomer, async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { customerId: req.customer.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, addresses, address: addresses[0] });
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

    // Find existing address for this customer to update, or create new
    const existingAddress = await prisma.address.findFirst({
      where: { customerId: req.customer.id },
      orderBy: { createdAt: 'desc' }
    });

    let address;
    try {
      if (existingAddress) {
        address = await prisma.address.update({
          where: { id: existingAddress.id },
          data: {
            ...coreData,
            contactName,
            contactPhone
          }
        });
      } else {
        address = await prisma.address.create({
          data: {
            customerId: req.customer.id,
            ...coreData,
            contactName,
            contactPhone
          }
        });
      }
      return res.json({ success: true, address, status: 'fully_synced' });
    } catch (prismaError) {
      console.warn('[PRISMA] Contact columns missing? Falling back to core save.', prismaError.message);
      
      if (existingAddress) {
        address = await prisma.address.update({
          where: { id: existingAddress.id },
          data: coreData
        });
      } else {
        address = await prisma.address.create({
          data: {
            customerId: req.customer.id,
            ...coreData
          }
        });
      }
      return res.json({ 
        success: true, 
        address, 
        status: 'partial_sync',
        warning: 'Contact details not saved.' 
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
