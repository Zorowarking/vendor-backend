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
    // DEV MOCK: If token is 'mock-session-token-123', we return a mock user
    if (idToken === 'mock-session-token-123') {
      req.user = {
        uid: 'mock-uid-123',
        phoneNumber: '+919999999999',
        email: 'dev@test.com'
      };
      return next();
    }

    // REAL AUTH: If admin is initialized, we try to verify
    if (admin.apps.length > 0) {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken;
      return next();
    } 

    // FALLBACK: For development, we'll allow any non-empty token as a valid user
    console.warn('[BACKEND] Running in MOCK AUTH fallback mode');
    const mockUid = idToken.substring(0, 10);
    const mockPhone = req.headers['x-mock-phone'] || `+1000${mockUid.replace(/[^0-9]/g, '').substring(0, 6)}`;
    
    req.user = {
      uid: mockUid,
      phoneNumber: mockPhone,
      name: 'Mock User'
    };
    next();

  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = firebaseAuth;
