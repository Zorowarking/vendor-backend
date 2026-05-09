const admin = require('firebase-admin');

// Mock Authentication Middleware
// In production, you would use admin.auth().verifyIdToken(token)
// For now, we simulate this to allow development without a service account JSON
const firebaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // DEV MOCK: Vendor Token
    if (idToken === 'mock-session-token-123') {
      req.user = {
        uid: 'mock-uid-123',
        phoneNumber: '+919999999999',
        email: 'dev@test.com'
      };
      return next();
    }

    // DEV MOCK: Customer Token
    if (idToken === 'mock-customer-token-123') {
      req.user = {
        uid: 'mock-uid-customer-123',
        phoneNumber: '+917777777777',
        email: 'customer@test.com'
      };
      return next();
    }

    // REAL AUTH: If admin is initialized, we try to verify
    if (admin.apps.length > 0) {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken;
      return next();
    } 

    // FALLBACK: For development, decode token if it looks like a JWT
    console.warn('[BACKEND] Running in MOCK AUTH fallback mode');
    
    let decoded = null;
    try {
      if (idToken.includes('.')) {
        const payload = idToken.split('.')[1];
        decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
      }
    } catch (e) {
      console.warn('[AUTH] Failed to decode JWT payload in mock mode');
    }

    const uid = decoded?.user_id || decoded?.sub || idToken.substring(0, 10);
    const phone = decoded?.phone_number || req.headers['x-mock-phone'] || `+1000${uid.replace(/[^0-9]/g, '').substring(0, 6)}`;
    
    req.user = {
      uid: uid,
      phoneNumber: phone,
      name: decoded?.name || 'Mock User',
      email: decoded?.email
    };
    next();

  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = firebaseAuth;
