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

const mockWorker = { on: () => {} };

// ============================
// Lazy Queue/Worker initializer
// ============================

let vendorPollingQueue = mockQueue;
let riderPollingQueue = mockQueue;
let orderSlaQueue = mockQueue;

// Try to initialize BullMQ after a brief delay to allow Redis to connect
setTimeout(async () => {
  if (connection.status === 'ready') {
    redisAvailable = true;
    try {
      const bullmq = require('bullmq');
      Queue = bullmq.Queue;
      Worker = bullmq.Worker;

      const prisma = require('./prisma');
      const fcm = require('./fcm');

      vendorPollingQueue = new Queue('vendorPolling', { connection });
      riderPollingQueue = new Queue('riderPolling', { connection });
      orderSlaQueue = new Queue('orderSla', { connection });

      // Worker: Poll Vendor active orders when in 'Stop New Orders'
      const vendorWorker = new Worker('vendorPolling', async (job) => {
        const { vendorId } = job.data;
        const activeOrdersCount = await prisma.order.count({
          where: {
            vendorId: vendorId,
            status: { in: ['preparing', 'ready_for_pickup', 'accepted'] }
          }
        });

        if (activeOrdersCount === 0) {
          console.log(`[BULLMQ] Vendor ${vendorId} has 0 active orders. Going offline.`);
          await prisma.vendor.update({ where: { id: vendorId }, data: { onlineStatus: 'offline' } });
          await fcm.updateFloatingBubble(vendorId, false);
        } else {
          console.log(`[BULLMQ] Vendor ${vendorId} still has ${activeOrdersCount} order(s). Polling again in 60s.`);
          await vendorPollingQueue.add('checkPending', { vendorId }, { delay: 60000 });
        }
      }, { connection });

      // Worker: Poll Rider active deliveries when in 'Stop New Orders'
      const riderWorker = new Worker('riderPolling', async (job) => {
        const { riderId } = job.data;
        const activeDeliveries = await prisma.order.count({
          where: {
            riderId: riderId,
            status: { in: ['on_the_way_to_pickup', 'order_picked_up', 'out_for_delivery'] }
          }
        });

        if (activeDeliveries === 0) {
          console.log(`[BULLMQ] Rider ${riderId} has 0 active deliveries. Going offline.`);
          await prisma.rider.update({ where: { id: riderId }, data: { onlineStatus: 'offline' } });
        } else {
          console.log(`[BULLMQ] Rider ${riderId} still has active deliveries. Polling again in 60s.`);
          await riderPollingQueue.add('checkPending', { riderId }, { delay: 60000 });
        }
      }, { connection });

      // Worker: SLA Order Timeouts
      const orderSlaWorker = new Worker('orderSla', async (job) => {
        const { orderId, type } = job.data;
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return;

        if (type === 'vendor_accept' && (order.status === 'pending_vendor' || order.status === 'Awaiting Vendor Acceptance')) {
          console.log(`[BULLMQ] Order ${orderId} SLA breached by Vendor. Flagging.`);
          await prisma.order.update({ where: { id: orderId }, data: { isFlaggedAdmin: true, flagReason: 'Vendor SLA Timeout' } });
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
        }
      }, { connection });

      [vendorWorker, riderWorker, orderSlaWorker].forEach(worker => {
        worker.on('error', err => {
          console.error('[BULLMQ] Worker error:', err.message);
        });
      });

      console.log('[BULLMQ] All queues and workers initialized successfully.');
    } catch (err) {
      console.error('[BULLMQ] Failed to initialize queues:', err.message);
    }
  } else {
    console.warn('[BULLMQ] Redis not ready after startup. Queues will remain in no-op mode.');
  }
}, 5000); // 5s grace period for Redis to connect in Docker

module.exports = {
  get vendorPollingQueue() { return vendorPollingQueue; },
  get riderPollingQueue()  { return riderPollingQueue;  },
  get orderSlaQueue()      { return orderSlaQueue;      },
};
