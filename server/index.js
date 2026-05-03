require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.server') });
// Also load the root .env for local dev (harmless if .env.server takes precedence)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: false });
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const authRoutes = require('./routes/auth');
const vendorRoutes = require('./routes/vendor');
const storageRoutes = require('./routes/storage');
const adminRoutes = require('./routes/admin');

const app = express();
const http = require('http');
const server = http.createServer(app);
console.log('🚀 [STAGE 1] Server created. Initializing Socket...');
const { initSocket } = require('./lib/socket');
const io = initSocket(server);

const PORT = process.env.PORT || 3000;
console.log(`🚀 [STAGE 1] Startup Info:
  - NODE_ENV: ${process.env.NODE_ENV}
  - PORT: ${PORT}
  - DATABASE_URL defined: ${!!process.env.DATABASE_URL}
  - REDIS_URL defined: ${!!process.env.REDIS_URL}
`);

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
app.use(cors({
  exposedHeaders: ['x-guest-id']
}));
app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// [DIAGNOSTIC] Pre-flight DB Check
(async () => {
  try {
    console.log('🔍 [STAGE 0] Testing Database Connection...');
    const { prisma } = require('./lib/prisma');
    // Simple query with 10s timeout
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Prisma Connection Timeout')), 10000))
    ]);
    console.log('✨ [STAGE 0] Database Connection Successful.');
  } catch (err) {
    console.error('❌ [STAGE 0] Database Connection FAILED:', err.message);
    console.warn('⚠️  Server will attempt to start but DB operations might fail.');
  }
})();

console.log('📦 [STAGE 2] Middleware loaded. Loading Routes...');

// Network Diagnostic Route
app.get('/api/network-check', (req, res) => {
  const nets = require('os').networkInterfaces();
  const results = {};
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!results[name]) results[name] = [];
        results[name].push(net.address);
      }
    }
  }
  res.json({ success: true, serverTime: new Date(), interfaces: results });
});

// Routes
console.log('  -> Loading Browsing...');
const browsingRoutes = require('./routes/browsing');
console.log('  -> Loading Cart...');
const cartRoutes = require('./routes/cart');
console.log('  -> Loading Customer...');
const customerRoutes = require('./routes/customer');
console.log('  -> Loading Orders...');
const orderRoutes = require('./routes/orders');
console.log('  -> Loading Payments...');
const paymentRoutes = require('./routes/payments');
console.log('  -> Loading Feedback...');
const feedbackRoutes = require('./routes/feedback');

app.use('/api/auth', authRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/browsing', browsingRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/feedback', feedbackRoutes);

const shadowfaxRoutes = require('./src/modules/delivery/shadowfax/shadowfax.routes');
app.use('/webhooks/shadowfax', shadowfaxRoutes);

console.log('✅ [STAGE 3] All Routes loaded.');

// Basic Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('[CRITICAL-ERROR]', err);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message,
    stack: err.stack,
    details: err
  });
});

// Start Server
// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 Vantyrn Backend started successfully!
  📡 HTTP & WebSocket listening on: http://0.0.0.0:${PORT}
  `);
});
