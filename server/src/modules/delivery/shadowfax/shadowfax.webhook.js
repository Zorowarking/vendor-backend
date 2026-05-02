const { prisma } = require('../../../../lib/prisma');
const validator = require('./shadowfax.validator');
const mapper = require('./shadowfax.mapper');
const logger = require('../../../../lib/logger');

class ShadowfaxWebhookHandler {
  /**
   * Handle incoming status callbacks.
   */
  async handleStatusCallback(rawPayload) {
    let validatedData;
    try {
      validatedData = validator.validateStatusCallback(rawPayload);
    } catch (error) {
      logger.error(`[Shadowfax Webhook] Validation failed for status callback: ${error.message}`);
      throw new Error('Invalid payload'); // will be caught by route handler
    }

    // Idempotency Check
    try {
      const existingCallbacks = await prisma.sfxCallback.findMany({
        where: {
          sfxOrderId: validatedData.sfx_order_id,
          processed: true
        }
      });
      const isDuplicate = existingCallbacks.some(cb => cb.payload && cb.payload.status === validatedData.status);
      if (isDuplicate) {
        logger.info(`[Shadowfax Webhook] Duplicate status callback received for SFX Order ${validatedData.sfx_order_id}: ${validatedData.status}. Skipping.`);
        return { duplicate: true };
      }
    } catch (err) {
      logger.error(`[Shadowfax Webhook] Failed to perform idempotency check: ${err.message}`);
    }

    // Insert into DB
    const sfxOrderId = validatedData.sfx_order_id;
    let dbRecordId;
    try {
      const dbRecord = await prisma.sfxCallback.create({
        data: {
          sfxOrderId: sfxOrderId,
          payload: rawPayload,
          processed: false
        }
      });
      dbRecordId = dbRecord.id;
    } catch (error) {
      logger.error(`[Shadowfax Webhook] Failed to save raw status payload: ${error.message}`);
      // We still proceed if db insert fails to not drop the event, though normally we'd want persistence.
    }

    const internalStatus = mapper.mapSfxStatusToInternal(validatedData.status);
    
    // Call DeliveryService to update internal order state
    try {
      const deliveryService = require('../delivery.service');
      await deliveryService.processSfxStatusUpdate({
        sfxOrderId: sfxOrderId.toString(),
        internalStatus,
        dbCallbackId: dbRecordId
      });
    } catch (e) {
      logger.error(`[Shadowfax Webhook] Failed to process status via DeliveryService: ${e.message}`);
    }

    return {
      internalStatus,
      sfxOrderId: sfxOrderId.toString(),
      clientOrderId: validatedData.client_order_id,
      dbCallbackId: dbRecordId
    };
  }

  /**
   * Handle incoming location callbacks.
   */
  async handleLocationCallback(rawPayload) {
    let validatedData;
    try {
      validatedData = validator.validateLocationCallback(rawPayload);
    } catch (error) {
      logger.error(`[Shadowfax Webhook] Validation failed for location callback: ${error.message}`);
      throw new Error('Invalid payload');
    }

    try {
      await prisma.sfxRiderLocationLog.create({
        data: {
          sfxOrderId: validatedData.sfx_order_id,
          lat: validatedData.rider_latitude,
          lng: validatedData.rider_longitude,
          pickupEta: validatedData.pickup_eta || null,
          dropEta: validatedData.drop_eta || null
        }
      });

      // Find internal order
      const sfxOrder = await prisma.sfxOrder.findUnique({
        where: { sfxOrderId: validatedData.sfx_order_id }
      });

      if (sfxOrder) {
        const { emitLocationUpdate } = require('../../../../lib/socket');
        emitLocationUpdate(
          sfxOrder.internalOrderId,
          validatedData.rider_latitude,
          validatedData.rider_longitude,
          validatedData.pickup_eta,
          validatedData.drop_eta
        );
      }
    } catch (error) {
      logger.error(`[Shadowfax Webhook] Failed to save location log or emit: ${error.message}`);
    }

    return {
      lat: validatedData.rider_latitude,
      lng: validatedData.rider_longitude,
      orderId: validatedData.client_order_id,
      pickupEta: validatedData.pickup_eta,
      dropEta: validatedData.drop_eta
    };
  }
}

module.exports = new ShadowfaxWebhookHandler();

