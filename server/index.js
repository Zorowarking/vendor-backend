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

// Basic Health Check (Available immediately)
app.get('/health', (req, res) => res.status(200).json({ status: 'live', timestamp: new Date() }));

// ==========================================
// STAGE 2: MIDDLEWARE & CONFIG
// ==========================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🚀 [STAGE 2] Basic middleware initialized.');

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
    const orderRoutes = require('./routes/order');
    const shadowfaxRoutes = require('./src/modules/delivery/shadowfax/shadowfax.routes');

    app.use('/api/browsing', browsingRoutes);
    app.use('/api/customer', customerRoutes);
    app.use('/api/vendor', vendorRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/webhooks/shadowfax', shadowfaxRoutes);

    // Network check helper
    app.get('/api/network-check', (req, res) => {
      res.json({ 
        status: 'ok', 
        env: process.env.NODE_ENV,
        time: new Date().toISOString()
      });
    });

    console.log('✨ [COMPLETE] All services and routes loaded successfully.');

  } catch (err) {
    console.error('❌ [CRITICAL] Initialization Failure:', err.message);
    // We don't exit(1) here because we want the health check to stay alive 
    // so we can debug via logs.
  }
})();
