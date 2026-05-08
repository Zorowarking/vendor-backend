const { connection } = require('./redis');

// ============================
// Redis Availability Check
// ============================

let redisAvailable = false;
let Queue, Worker;

// Try to load BullMQ only if Redis connects
connection.on('connect', () => {
  if (!redisAvailable) {
    console.log('[BULLMQ] Redis connected — BullMQ queues are active.');
  }
  redisAvailable = true;
});

connection.on('error', () => {
  if (!redisAvailable) return; // Wait for initial failure or subsequent drop
  console.warn('[BULLMQ] Redis connection lost. BullMQ queues are in no-op fallback mode.');
  redisAvailable = false;
});


// ============================
// Mock Queue / Worker (no-op fallback)
// ============================

const mockQueue = {
  add: async (...args) => {
    console.warn('[BULLMQ] Queue.add() skipped — Redis is not connected.');
    return null;
  },
};

// ============================
// Lazy Queue/Worker initializer
// ============================

let orderSlaQueue = mockQueue;

// Try to initialize BullMQ after a brief delay to allow Redis to connect
setTimeout(async () => {
  if (connection.status === 'ready') {
    redisAvailable = true;
    try {
      const bullmq = require('bullmq');
      Queue = bullmq.Queue;
      Worker = bullmq.Worker;

      const { prisma } = require('./prisma');
      const { emitOrderStatusUpdate } = require('./socket');

      orderSlaQueue = new Queue('orderSla', { connection });

      // Worker Lifecycle Guard (Singleton Worker)
      if (!global.__workersInitialized) {
        console.log('[BULLMQ] Initializing singleton workers...');
        global.__workersInitialized = true;

        // Worker: SLA Order Timeouts
        const orderSlaWorker = new Worker('orderSla', async (job) => {
          const { orderId, type } = job.data;
          const order = await prisma.order.findUnique({ where: { id: orderId } });
          if (!order) return;

          if (type === 'vendor_accept' && (order.status === 'pending_vendor' || order.status === 'Awaiting Vendor Acceptance')) {
            console.log(`[BULLMQ] Order ${orderId} SLA breached by Vendor. Cancelling and moving to history.`);
            
            await prisma.order.update({ 
              where: { id: orderId }, 
              data: { 
                status: 'CANCELLED',
                isFlaggedAdmin: true, 
                flagReason: 'Vendor SLA Timeout (No Acceptance)',
                statusHistory: {
                  create: {
                    status: 'CANCELLED',
                    changedBy: 'SYSTEM',
                    notes: 'Auto-cancelled due to vendor SLA timeout (No Acceptance)'
                  }
                }
              } 
            });

            // Emit status update to both parties
            emitOrderStatusUpdate(orderId, 'CANCELLED', 'SYSTEM');

            // Log breach in SlaMetric table (Aggregate)
            await prisma.vendorSlaMetric.upsert({
              where: { vendorId: order.vendorId },
              update: { breachedOrders: { increment: 1 } },
              create: { vendorId: order.vendorId, totalOrders: 1, breachedOrders: 1 }
            });

            // Log detailed Breach Record
            await prisma.vendorBreach.create({
              data: {
                vendorId: order.vendorId,
                orderId: orderId,
                type: 'SLA_TIMEOUT',
                reason: 'Vendor failed to accept order within 1 minute'
              }
            });
          } else if (type === 'vendor_support' && order.status === 'pending_vendor_response') {
            console.log(`[BULLMQ] Order ${orderId} SLA breached for Vendor Support wait. Flagging.`);
            await prisma.order.update({ where: { id: orderId }, data: { isFlaggedAdmin: true, flagReason: 'Vendor Support Resolution Timeout' } });
          } else if (type === 'vendor_prepare_start' && order.status === 'accepted') {
            console.log(`[BULLMQ] Order ${orderId} preparation delayed by Vendor. Flagging.`);
            await prisma.order.update({ 
              where: { id: orderId }, 
              data: { 
                isFlagged: true, 
                isFlaggedAdmin: true, 
                flagReason: 'Delayed Preparation' 
              } 
            });

            // Log breach in SlaMetric table (Aggregate)
            await prisma.vendorSlaMetric.upsert({
              where: { vendorId: order.vendorId },
              update: { breachedOrders: { increment: 1 } },
              create: { vendorId: order.vendorId, totalOrders: 1, breachedOrders: 1 }
            });

            // Log detailed Breach Record
            await prisma.vendorBreach.create({
              data: {
                vendorId: order.vendorId,
                orderId: orderId,
                type: 'PREPARATION_DELAY',
                reason: 'Vendor failed to mark order as ready within expected time'
              }
            });
          }
        }, { 
          connection,
          autorun: true,
          metrics: { maxDataPoints: 0 }, // Disable metrics to save Redis ops
          drainDelay: 5, // Check less frequently when idle
          stalledInterval: 60000, // Check for stalled jobs less frequently (every 60s instead of 30s)
        });

        orderSlaWorker.on('error', err => {
          console.error('[BULLMQ] orderSlaWorker error:', err.message);
        });
        
        // Handle Graceful Shutdown for Worker
        process.on('SIGTERM', async () => {
          console.log('[BULLMQ] Closing workers gracefully...');
          await orderSlaWorker.close();
        });
        process.on('SIGINT', async () => {
          await orderSlaWorker.close();
        });

        console.log('[BULLMQ] Worker initialized successfully.');
      }

      console.log('[BULLMQ] Queues initialized successfully.');
    } catch (err) {
      console.error('[BULLMQ] Failed to initialize queues:', err.message);
    }
  } else {
    console.warn('[BULLMQ] Redis not ready after startup. Queues will remain in no-op mode.');
  }
}, 5000); // 5s grace period for Redis to connect in Docker

module.exports = {
  get orderSlaQueue() { return orderSlaQueue; },
};
