require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.server') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: false });

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ==========================================
// STAGE 1: IMMEDIATE BINDING
// ==========================================
// We start listening IMMEDIATELY to pass Railway's health check.
// Heavy routes and services will load in the background.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [BACKEND] Server is LIVE and listening on port ${PORT}`);
  console.log(`🌐 [HEALTH] Health check available at /health`);
});

// ==========================================
// STAGE 2: MIDDLEWARE & CONFIG
// ==========================================
// Structured Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));

// Enhanced CORS for Expo/Mobile
app.use(cors({
  origin: '*', // For production, replace with specific origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🚀 [STAGE 2] Basic middleware initialized.');

// Health Check (Both root and /api/health)
const healthHandler = (req, res) => res.status(200).json({ 
  status: 'live', 
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV,
  uptime: process.uptime()
});

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ==========================================
// STAGE 2.5: FIREBASE ADMIN INIT
// ==========================================
try {
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountVar) {
      try {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ [FIREBASE] Admin SDK initialized successfully.');
      } catch (parseError) {
        console.error('❌ [FIREBASE] Failed to parse service account JSON:', parseError.message);
      }
    } else {
      console.warn('⚠️ [FIREBASE] FIREBASE_SERVICE_ACCOUNT missing. Auth will run in mock/fallback mode.');
    }
  }
} catch (fbError) {
  console.error('❌ [FIREBASE] Initialization error:', fbError.message);
}

// ==========================================
// STAGE 3: HEAVY INITIALIZATION (Background)
// ==========================================
(async () => {
  try {
    console.log('📦 [STAGE 3] Loading heavy modules...');
    
    // 1. Socket.io
    const { initSocket } = require('./lib/socket');
    initSocket(server);
    console.log('✅ [STAGE 3] Socket.io initialized.');

    // 2. Database Pre-flight
    const { prisma } = require('./lib/prisma');
    console.log('🔍 [STAGE 3] Testing Database Connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ [STAGE 3] Database Connection Successful.');

    // 3. Routes
    console.log('🛣️ [STAGE 3] Loading routes...');
    const browsingRoutes = require('./routes/browsing');
    const customerRoutes = require('./routes/customer');
    const vendorRoutes = require('./routes/vendor');
    const orderRoutes = require('./routes/orders');
    const authRoutes = require('./routes/auth');
    const cartRoutes = require('./routes/cart');
    const paymentRoutes = require('./routes/payments');
    const storageRoutes = require('./routes/storage');
    const shadowfaxRoutes = require('./src/modules/delivery/shadowfax/shadowfax.routes');

    app.use('/api/auth', authRoutes);
    app.use('/api/browsing', browsingRoutes);
    app.use('/api/customer', customerRoutes);
    app.use('/api/vendor', vendorRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/cart', cartRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/storage', storageRoutes);
    app.use('/api/delivery/shadowfax', shadowfaxRoutes);

    // Stage 3 Diagnostic health
    app.get('/api/health/status', (req, res) => {
      res.json({
        stage3: true,
        db: 'connected',
        timestamp: new Date().toISOString()
      });
    });

    // 404 Handler (Phase 1)
    app.use((req, res) => {
      console.warn(`[404] ${req.method} ${req.originalUrl}`);
      res.status(404).json({ 
        error: 'Not Found', 
        message: `Route ${req.originalUrl} does not exist`,
        path: req.originalUrl 
      });
    });

    // Global Error Handler (Phase 1)
    app.use((err, req, res, next) => {
      console.error('[CRITICAL-ERROR]', {
        message: err.message,
        stack: err.stack,
        path: req.originalUrl,
        method: req.method
      });
      
      res.status(err.status || 500).json({ 
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
        code: err.code || 'UNKNOWN_ERROR'
      });
    });

    console.log('✅ [STAGE 3] Routes and Error Handlers loaded.');

  } catch (err) {
    console.error('❌ [CRITICAL] Stage 3 Initialization Failure:');
    console.error('   Error Name:', err.name);
    console.error('   Error Message:', err.message);
    if (err.stack) console.error('   Stack Trace:', err.stack);
    
    // We don't exit(1) here because we want the health check to stay alive 
    // so we can debug via logs.
  }
})();
