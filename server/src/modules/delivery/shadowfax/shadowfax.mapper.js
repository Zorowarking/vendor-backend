/**
 * Shadowfax Data Mapper
 * Transforms data between internal representations and Shadowfax API requirements.
 */

/**
 * Builds the place order payload.
 */
function buildPlaceOrderPayload(internalOrder, vendor, customer) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const coid = `${internalOrder.id}-${dateStr}`;

  return {
    orderDetails: {
      client_order_id: coid,
      order_value: Number(internalOrder.totalAmount),
      paid: "true" // Assume paid for this integration per business logic
    },
    customerDetails: {
      name: customer.fullName || 'Customer',
      contact: customer.phone,
      address_line_1: internalOrder.addressSnapshot?.addressLine1 || 'Default',
      city: internalOrder.addressSnapshot?.city || 'Default',
      latitude: Number(internalOrder.addressSnapshot?.latitude) || 0,
      longitude: Number(internalOrder.addressSnapshot?.longitude) || 0
    },
    productDetails: internalOrder.items.map(item => ({
      id: item.productId,
      name: item.productName,
      price: Number(item.unitPrice)
    }))
  };
}

/**
 * Maps Shadowfax status to Internal status.
 */
function mapSfxStatusToInternal(sfxStatus) {
  switch (sfxStatus) {
    case 'ACCEPTED':
      return 'AWAITING_RIDER_ASSIGNMENT';
    case 'ALLOTTED':
      return 'RIDER_ASSIGNED';
    case 'ARRIVED':
      return 'RIDER_AT_STORE';
    case 'DISPATCHED':
      return 'PICKED_UP';
    case 'ARRIVED_CUSTOMER_DOORSTEP':
      return 'ARRIVED_AT_CUSTOMER';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'CANCELLED':
      return 'ORDER_CANCELLED';
    case 'CANCELLED_BY_CUSTOMER':
      return 'CUSTOMER_DENIED_DELIVERY';
    case 'RETURNED_TO_SELLER':
      return 'RETURNED_TO_SELLER';
    case 'UNDELIVERED':
      return 'ADDRESS_NOT_FOUND';
    default:
      console.warn(`[Shadowfax Mapper] Unknown SFX Status received: ${sfxStatus}`);
      return null;
  }
}

/**
 * Maps Internal cancel reason to Shadowfax required format.
 */
function mapCancelReasonToSfx(internalReason, userRole = 'Seller') {
  const reason = internalReason.length > 128 ? internalReason.substring(0, 125) + '...' : internalReason;
  return {
    reason,
    user: userRole
  };
}

module.exports = {
  buildPlaceOrderPayload,
  mapSfxStatusToInternal,
  mapCancelReasonToSfx
};
