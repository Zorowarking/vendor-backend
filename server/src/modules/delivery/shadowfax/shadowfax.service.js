const shadowfaxClient = require('./shadowfaxClient');
const logger = require('../../../../lib/logger');

const ERROR_CODES = {
  SFX_API_ERROR: 'SFX_API_ERROR',
  SFX_DUPLICATE_COID: 'SFX_DUPLICATE_COID',
  SFX_CANCEL_FAILED: 'SFX_CANCEL_FAILED',
  SFX_ORDER_REJECTED: 'SFX_ORDER_REJECTED',
  SFX_SERVICE_UNAVAILABLE: 'SFX_SERVICE_UNAVAILABLE',
  SFX_TIMEOUT: 'SFX_TIMEOUT',
  SFX_VALIDATION_ERROR: 'SFX_VALIDATION_ERROR',
  SFX_INVALID_RESPONSE: 'SFX_INVALID_RESPONSE'
};

class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Handle Axios errors consistently
 */
function handleSfxError(error, context) {
  if (error.response) {
    const status = error.response.status;
    const sfxMessage = error.response.data?.message || JSON.stringify(error.response.data);
    
    let code = ERROR_CODES.SFX_API_ERROR;
    if (status === 400) {
      if (sfxMessage.includes('Repeating COID') || sfxMessage.includes('Duplicate COID')) {
        code = ERROR_CODES.SFX_DUPLICATE_COID;
      } else if (context === 'cancelOrder') {
        code = ERROR_CODES.SFX_CANCEL_FAILED;
      } else {
        code = ERROR_CODES.SFX_ORDER_REJECTED;
      }
    } else if (status >= 500) {
      code = ERROR_CODES.SFX_SERVICE_UNAVAILABLE;
    }

    logger.error(`[Shadowfax API] Error in ${context}: ${sfxMessage}`);
    throw new AppError(`Shadowfax API Error (${context}): ${sfxMessage}`, code, status);
  } else if (error.code === 'ECONNABORTED') {
    logger.error(`[Shadowfax API] Timeout in ${context}`);
    throw new AppError(`Shadowfax request timed out (${context})`, ERROR_CODES.SFX_TIMEOUT, 504);
  } else {
    logger.error(`[Shadowfax API] Service unavailable in ${context}: ${error.message}`);
    throw new AppError(`Shadowfax service unavailable (${context}): ${error.message}`, ERROR_CODES.SFX_SERVICE_UNAVAILABLE, 503);
  }
}

// Validation Helpers
const isValidLat = (lat) => typeof lat === 'number' && lat >= -90 && lat <= 90;
const isValidLng = (lng) => typeof lng === 'number' && lng >= -180 && lng <= 180;
const isSafeString = (str) => typeof str === 'string' && str.trim().length > 0 && /^[a-zA-Z0-9-_]+$/.test(str);

class ShadowfaxService {
  /**
   * Check if Shadowfax is serviceable for a given location and value.
   * @param {Object} params
   * @param {string} params.storeCode - The shadowfax store code.
   * @param {number} params.orderValue - Total order amount.
   * @param {boolean} params.paid - Whether the order is prepaid.
   * @param {number} [params.dropLat] - Drop latitude (optional).
   * @param {number} [params.dropLng] - Drop longitude (optional).
   * @param {string} [params.coid] - Client order ID (optional).
   * @returns {Promise<Object>} Response object containing available_rider_count and delivery_cost
   */
  async checkServiceability({ storeCode, orderValue, paid, dropLat, dropLng, coid }) {
    if (!storeCode || typeof orderValue !== 'number' || orderValue < 0 || typeof paid !== 'boolean') {
      throw new AppError('Invalid or missing required fields for serviceability check', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }
    if (dropLat !== undefined && !isValidLat(dropLat)) {
      throw new AppError('Invalid drop_latitude', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }
    if (dropLng !== undefined && !isValidLng(dropLng)) {
      throw new AppError('Invalid drop_longitude', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }

    try {
      const payload = {
        store_code: storeCode,
        order_value: orderValue,
        paid: paid ? "true" : "false"
      };
      if (dropLat) payload.drop_latitude = dropLat;
      if (dropLng) payload.drop_longitude = dropLng;
      if (coid) payload.COID = coid;

      logger.info(`[Shadowfax Service] Checking serviceability for store: ${storeCode}, orderValue: ${orderValue}`);
      const response = await shadowfaxClient.put('/api/v2/store_serviceability/', payload);
      
      if (response.data && typeof response.data.available_rider_count !== 'number') {
        throw new AppError('Invalid response: missing available_rider_count', ERROR_CODES.SFX_INVALID_RESPONSE, 502);
      }
      
      logger.info(`[Shadowfax Service] Serviceability check passed. Riders available: ${response.data.available_rider_count}`);
      return response.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      handleSfxError(error, 'checkServiceability');
    }
  }

  /**
   * Place an order with Shadowfax.
   * @param {Object} params
   * @param {string} params.storeCode - The shadowfax store code.
   * @param {Object} params.orderDetails - The order details payload.
   * @param {Object} params.customerDetails - The customer details payload.
   * @param {Array} params.productDetails - The product details payload array.
   * @param {Object} [params.misc] - Additional miscellaneous metadata.
   * @returns {Promise<Object>} Response containing sfx_order_id and track_url
   */
  async placeOrder({ storeCode, orderDetails, customerDetails, productDetails, misc }) {
    if (!storeCode || typeof orderDetails?.order_value !== 'number' || orderDetails.order_value <= 0) {
      throw new AppError('Invalid store code or order value', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }
    if (!isSafeString(orderDetails?.client_order_id)) {
      throw new AppError('Invalid client_order_id', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }
    if (!Array.isArray(productDetails) || productDetails.length === 0) {
      throw new AppError('product_details must be a non-empty array', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }
    for (const p of productDetails) {
      if (typeof p.id !== 'string' && typeof p.id !== 'number') throw new AppError('Invalid product id', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
      if (!p.name || typeof p.price !== 'number') throw new AppError('Invalid product name or price', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }

    try {
      orderDetails.paid = orderDetails.paid === true || orderDetails.paid === "true" ? "true" : "false";

      const payload = {
        store_code: storeCode,
        order_details: orderDetails,
        customer_details: customerDetails,
        product_details: productDetails
      };
      if (misc) payload.misc = misc;

      logger.info(`[Shadowfax Service] Placing order COID: ${orderDetails.client_order_id} for store ${storeCode}`);
      const response = await shadowfaxClient.post('/api/v2/stores/orders/', payload);
      
      if (!response.data || typeof response.data.sfx_order_id === 'undefined') {
        throw new AppError('Invalid response: missing sfx_order_id', ERROR_CODES.SFX_INVALID_RESPONSE, 502);
      }
      
      logger.info(`[Shadowfax Service] Order placed successfully. SFX ID: ${response.data.sfx_order_id}`);
      return response.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      handleSfxError(error, 'placeOrder');
    }
  }

  /**
   * Cancel an existing Shadowfax order.
   * @param {Object} params
   * @param {string} params.sfxOrderId - The shadowfax order ID.
   * @param {string} params.reason - Cancellation reason.
   * @param {string} params.user - The user executing cancel (e.g., 'Seller').
   * @returns {Promise<Object>} API response object
   */
  async cancelOrder({ sfxOrderId, reason, user }) {
    if (!sfxOrderId || !reason || !user) {
      throw new AppError('Missing required fields for cancellation', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }

    try {
      const payload = { reason, user };
      logger.info(`[Shadowfax Service] Cancelling order ${sfxOrderId} due to: ${reason}`);
      const response = await shadowfaxClient.put(`/api/v2/orders/${sfxOrderId}/cancel/`, payload);
      logger.info(`[Shadowfax Service] Order ${sfxOrderId} cancelled successfully.`);
      return response.data;
    } catch (error) {
      handleSfxError(error, 'cancelOrder');
    }
  }

  /**
   * Mark an order as dispatch ready.
   * @param {Object} params
   * @param {string} params.coid - Client Order ID.
   * @param {string} params.shipmentReadyTimestamp - ISO timestamp.
   * @returns {Promise<Object>} API response object
   */
  async markDispatchReady({ coid, shipmentReadyTimestamp }) {
    if (!coid || !shipmentReadyTimestamp) {
      throw new AppError('Missing required fields for dispatch ready', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }

    try {
      const payload = { shipment_ready_timestamp: shipmentReadyTimestamp };
      logger.info(`[Shadowfax Service] Marking COID ${coid} as dispatch ready.`);
      const response = await shadowfaxClient.put(`/api/v2/orders/${coid}/dispatch-ready/`, payload);
      return response.data;
    } catch (error) {
      handleSfxError(error, 'markDispatchReady');
    }
  }

  /**
   * Get the status of an existing order.
   * @param {Object} params
   * @param {string} params.sfxOrderId - The shadowfax order ID.
   * @returns {Promise<Object>} API response object with status
   */
  async getOrderStatus({ sfxOrderId }) {
    if (!sfxOrderId) {
      throw new AppError('sfxOrderId is required', ERROR_CODES.SFX_VALIDATION_ERROR, 400);
    }

    try {
      const response = await shadowfaxClient.get(`/api/v2/orders/${sfxOrderId}/status/`);
      return response.data;
    } catch (error) {
      handleSfxError(error, 'getOrderStatus');
    }
  }
}

module.exports = new ShadowfaxService();
