const shadowfaxService = require('./shadowfax/shadowfax.service');
const mapper = require('./shadowfax/shadowfax.mapper');
const env = require('../../config/env');
const OrderService = require('../../../services/orderService');
const logger = require('../../../lib/logger');
const { prisma } = require('../../../lib/prisma');

/**
 * Orchestration layer for Delivery operations.
 * Isolates the core modules (Orders, Vendors) from the specific 3PL implementation (Shadowfax).
 */
class DeliveryService {
  /**
   * Initiates the delivery process post-payment.
   * @param {string} orderId
   * @returns {Promise<void>}
   */
  async initiateDelivery(orderId) {
    if (process.env.USE_SANDBOX_PAYMENTS === 'true') {
      logger.info(`[DeliveryService] Sandbox mode detected. Simulating delivery for order ${orderId}`);
      this.startSandboxSimulation(orderId);
      return;
    }
    logger.info(`[DeliveryService] initiateDelivery called for order ${orderId}`);
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, customer: true, vendor: true }
      });
      if (!order) throw new Error('Order not found');

      const placeWithRetry = async (retryCount = 0) => {
        try {
          const payload = mapper.buildPlaceOrderPayload(order, order.vendor, order.customer);
          if (retryCount > 0) {
             payload.orderDetails.client_order_id = `${payload.orderDetails.client_order_id}-R${retryCount}`;
          }
          
          const sfxResponse = await shadowfaxService.placeOrder({
            storeCode: order.vendor.sfxStoreCode || env.SFX_STORE_CODE,
            orderDetails: payload.orderDetails,
            customerDetails: payload.customerDetails,
            productDetails: payload.productDetails
          });
          return { sfxResponse, clientOrderId: payload.orderDetails.client_order_id };
        } catch (error) {
           if (error.code === 'SFX_DUPLICATE_COID' && retryCount === 0) {
             const existing = await prisma.sfxOrder.findUnique({ where: { internalOrderId: orderId }});
             if (existing) {
               logger.info(`[DeliveryService] Recovered existing SFX order for ${orderId}`);
               return { 
                 sfxResponse: { sfx_order_id: existing.sfxOrderId.toString(), status: existing.sfxStatus, track_url: existing.trackUrl },
                 clientOrderId: existing.clientOrderId
               };
             }
             logger.warn(`[DeliveryService] Duplicate COID, retrying with new suffix for ${orderId}`);
             return await placeWithRetry(1);
           }
           throw error;
        }
      };

      const { sfxResponse, clientOrderId } = await placeWithRetry();

      if (sfxResponse && sfxResponse.sfx_order_id) {
        // Save to sfx_orders
        await prisma.sfxOrder.upsert({
          where: { internalOrderId: orderId },
          update: {
            sfxOrderId: BigInt(sfxResponse.sfx_order_id),
            sfxStatus: sfxResponse.status,
            trackUrl: sfxResponse.track_url || null
          },
          create: {
            internalOrderId: order.id,
            sfxOrderId: BigInt(sfxResponse.sfx_order_id),
            storeCode: order.vendor.sfxStoreCode || env.SFX_STORE_CODE,
            clientOrderId: clientOrderId,
            sfxStatus: sfxResponse.status,
            trackUrl: sfxResponse.track_url || null
          }
        });
        
        // Update main order
        await prisma.order.update({
          where: { id: order.id },
          data: { sfxOrderId: BigInt(sfxResponse.sfx_order_id) }
        });
        
        logger.info(`[DeliveryService] successfully initiated delivery for order ${orderId}, sfxOrderId: ${sfxResponse.sfx_order_id}`);
      }
    } catch (error) {
      logger.error(`[DeliveryService] Error initiating delivery for order ${orderId}: ${error.message}`);
      this._emitAdminError(orderId, error);
      throw error;
    }
  }

  /**
   * Attempts to cancel an ongoing delivery.
   * @param {string} orderId
   * @param {string} reason
   * @returns {Promise<void>}
   */
  async cancelDelivery(orderId, reason) {
    logger.info(`[DeliveryService] cancelDelivery called for order ${orderId} with reason: ${reason}`);
    try {
      const sfxOrder = await prisma.sfxOrder.findUnique({ where: { internalOrderId: orderId } });
      if (!sfxOrder) {
        logger.info(`[DeliveryService] No SFX order found for internal order ${orderId}, skipping 3PL cancel.`);
        return;
      }

      const cancelPayload = mapper.mapCancelReasonToSfx(reason, 'Seller');
      await shadowfaxService.cancelOrder({
        sfxOrderId: sfxOrder.sfxOrderId.toString(),
        reason: cancelPayload.reason,
        user: cancelPayload.user
      });
      logger.info(`[DeliveryService] successfully cancelled delivery for order ${orderId}`);
    } catch (error) {
      logger.warn(`[DeliveryService] Failed to cancel delivery for order ${orderId} on SFX: ${error.message}`);
      this._emitAdminError(orderId, error);
      // We don't throw, we just log and allow internal cancellation to proceed.
    }
  }

  /**
   * Triggers the 3PL dispatch signal when the vendor marks the order ready.
   * @param {string} orderId
   * @returns {Promise<void>}
   */
  async onVendorReadyForPickup(orderId) {
    logger.info(`[DeliveryService] onVendorReadyForPickup called for order ${orderId}`);
    try {
      const sfxOrder = await prisma.sfxOrder.findUnique({ where: { internalOrderId: orderId } });
      if (!sfxOrder) {
        logger.info(`[DeliveryService] No SFX order found for internal order ${orderId}, skipping 3PL dispatch.`);
        return;
      }
      
      const shipmentReadyTimestamp = new Date().toISOString();
      await shadowfaxService.markDispatchReady({
        coid: sfxOrder.clientOrderId,
        shipmentReadyTimestamp
      });
      logger.info(`[DeliveryService] successfully sent dispatch ready signal for order ${orderId}`);
    } catch (error) {
      logger.warn(`[DeliveryService] Failed to send dispatch ready signal for order ${orderId}: ${error.message}`);
      this._emitAdminError(orderId, error);
    }
  }

  /**
   * Processes status updates received via Shadowfax webhooks.
   */
  async processSfxStatusUpdate({ sfxOrderId, internalStatus, dbCallbackId }) {
    logger.info(`[DeliveryService] Processing status update for SFX Order ${sfxOrderId} -> ${internalStatus}`);
    try {
      const sfxOrder = await prisma.sfxOrder.findUnique({
        where: { sfxOrderId: BigInt(sfxOrderId) }
      });
      
      if (!sfxOrder) {
        logger.warn(`[DeliveryService] Could not find internal order mapped to SFX order ${sfxOrderId}`);
        return;
      }

      if (internalStatus) {
        await OrderService.updateOrderStatus(sfxOrder.internalOrderId, internalStatus, 'SYSTEM');
        
        await prisma.sfxOrder.update({
          where: { internalOrderId: sfxOrder.internalOrderId },
          data: { sfxStatus: internalStatus }
        });
      }

      if (dbCallbackId) {
        await prisma.sfxCallback.update({
          where: { id: dbCallbackId },
          data: { processed: true }
        });
      }
    } catch (error) {
      logger.error(`[DeliveryService] Failed to process status update for SFX Order ${sfxOrderId}: ${error.message}`);
      this._emitAdminError(null, error);
      throw error;
    }
  }

  _emitAdminError(orderId, error) {
    try {
      const { getIo } = require('../../../lib/socket');
      const io = getIo();
      if (io) {
        io.of('/admin').to('admin_global').emit('sfx_error', {
          orderId: orderId || 'UNKNOWN',
          errorCode: error.code || 'UNKNOWN_ERROR',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (socketErr) {
      logger.error(`[DeliveryService] Failed to emit admin error: ${socketErr.message}`);
    }
  }

  /**
   * Simulates delivery progress for sandbox testing.
   */
  async startSandboxSimulation(orderId) {
    const transitions = [
      { status: 'ACCEPTED', delay: 5000 },
      { status: 'PREPARING', delay: 10000 },
      { status: 'READY_FOR_PICKUP', delay: 15000 },
      { status: 'PICKED_UP', delay: 20000 },
      { status: 'DELIVERED', delay: 30000 },
    ];

    for (const t of transitions) {
      setTimeout(async () => {
        try {
          // Check if order still exists and is not cancelled
          const currentOrder = await prisma.order.findUnique({ where: { id: orderId } });
          if (!currentOrder) {
             logger.info(`[SandboxDelivery] Order ${orderId} no longer exists. Stopping simulation.`);
             return;
          }
          
          if (['CANCELLED', 'ORDER_CANCELLED', 'CANCELLED_BY_VENDOR'].includes(currentOrder.status.toUpperCase())) {
             logger.info(`[SandboxDelivery] Order ${orderId} is cancelled. Stopping simulation.`);
             return;
          }

          logger.info(`[SandboxDelivery] Transitioning order ${orderId} to ${t.status}`);
          const OrderService = require('../../../services/orderService');
          await OrderService.updateOrderStatus(orderId, t.status, 'SYSTEM');
        } catch (err) {
          logger.error(`[SandboxDelivery] Failed transition to ${t.status}: ${err.message}`);
        }
      }, t.delay);
    }
  }
}

module.exports = new DeliveryService();

