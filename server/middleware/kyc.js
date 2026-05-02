const { prisma, withRetry } = require('../lib/prisma');

const requireKyc = async (req, res, next) => {
  try {
    const { uid } = req.user; // uid from Firebase token
    
    // Check Profile
    const profile = await withRetry(() => prisma.profile.findUnique({
      where: { firebaseUid: uid },
      include: { vendor: true, rider: true }
    }));


    if (!profile) {
      return res.status(403).json({ error: 'Profile not found' });
    }

    // Role specific KYC mapping
    let isApproved = false;
    let fallbackStatus = 'PENDING';

    const APPROVED_STATUSES = ['approved', 'active', 'ready'];

    if (profile.role === 'VENDOR' && profile.vendor) {
      fallbackStatus = profile.vendor.accountStatus;
      isApproved = APPROVED_STATUSES.includes(profile.vendor.accountStatus?.toLowerCase());
    } else if (profile.role === 'RIDER' && profile.rider) {
      fallbackStatus = profile.rider.accountStatus;
      isApproved = APPROVED_STATUSES.includes(profile.rider.accountStatus?.toLowerCase());
    }

    // Reject if KYC not in an approved state
    if (!isApproved) {
      console.warn(`[KYC] Access Denied for UID ${uid}: Role=${profile.role}, Status=${fallbackStatus}`);
      return res.status(403).json({ error: 'KYC not approved', status: fallbackStatus });
    }

    req.profile = profile;
    next();
  } catch (error) {
    console.error('[KYC] Middleware Error:', error);
    res.status(500).json({ error: 'Failed to verify KYC status' });
  }
};

module.exports = requireKyc;
