const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');

// Mock Database (In-memory)
// In a real app, use Prisma, Mongoose, etc.
const users = {
  'mock-uid-123': {
    uid: 'mock-uid-123',
    phoneNumber: '+919999999999',
    role: null,
    profileStatus: 'PENDING',
    businessName: 'Mock Store'
  }
};

/**
 * Sync User Profile
 * Fetches the user from the DB or creates a new one if it doesn't exist
 */
router.post('/sync', firebaseAuth, (req, res) => {
  const { uid, phoneNumber } = req.user;
  
  console.log(`[AUTH] Syncing user: ${uid} (${phoneNumber})`);

  // Check if user exists
  if (!users[uid]) {
    console.log(`[AUTH] Creating new user record for ${uid}`);
    users[uid] = {
      uid,
      phoneNumber,
      role: null,
      profileStatus: 'PENDING',
      createdAt: new Date().toISOString()
    };
  }

  const user = users[uid];
  
  res.json({
    success: true,
    user: {
      uid: user.uid,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profileStatus: user.profileStatus
    }
  });
});

/**
 * Update User Role
 */
router.post('/role', firebaseAuth, (req, res) => {
  const { uid } = req.user;
  const { role } = req.body;

  if (!['VENDOR', 'RIDER'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (!users[uid]) {
    return res.status(404).json({ error: 'User not found during role update' });
  }

  console.log(`[AUTH] Updating role for ${uid} to ${role}`);
  users[uid].role = role;
  
  res.json({
    success: true,
    user: users[uid]
  });
});

/**
 * Mock Status Enforcement Test (Update profile status)
 * Accessible only for testing
 */
router.post('/status-dev', firebaseAuth, (req, res) => {
  const { uid } = req.user;
  const { status, reason } = req.body;

  if (!users[uid]) return res.status(404).json({ error: 'User not found' });

  users[uid].profileStatus = status;
  if (reason) users[uid].suspensionReason = reason;

  res.json({ success: true, status: users[uid].profileStatus });
});

module.exports = router;
