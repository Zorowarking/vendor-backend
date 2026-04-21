const { prisma } = require('../lib/prisma');

/**
 * Middleware to verify that the profile associated with the Firebase UID has a 'CUSTOMER' role.
 * Must be used after firebaseAuth middleware.
 */
const requireCustomer = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const profile = await prisma.profile.findUnique({
      where: { firebaseUid: uid },
      include: { customer: true }
    });

    if (!profile || profile.role !== 'CUSTOMER') {
      return res.status(403).json({ 
        error: 'Forbidden: Customer role required',
        message: 'Please login or register as a customer to continue.'
      });
    }

    // Attach profile and customer objects for downstream use
    req.profile = profile;
    req.customer = profile.customer;
    next();
  } catch (error) {
    console.error('[MIDDLEWARE] requireCustomer error:', error);
    res.status(500).json({ error: 'Internal server error during role verification' });
  }
};

module.exports = requireCustomer;
