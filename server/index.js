require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin (Optional, will use mock if config is missing)
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[FIREBASE] Admin initialized successfully');
  } else {
    console.warn('[FIREBASE] No service account found. Using mock auth mode.');
  }
} catch (error) {
  console.error('[FIREBASE] Error initializing Admin SDK:', error.message);
}

// Middleware
app.use(cors());
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);

// Basic Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 Vantyrn Backend started successfully!
  📡 Listening on: http://0.0.0.0:${PORT}
  🛠️ Auth System Only mode enabled
  `);
});
