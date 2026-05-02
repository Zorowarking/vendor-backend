const { z } = require('zod');

const validStatuses = [
  'ACCEPTED', 'ALLOTTED', 'ARRIVED', 'DISPATCHED', 
  'ARRIVED_CUSTOMER_DOORSTEP', 'DELIVERED', 'CANCELLED', 
  'CANCELLED_BY_CUSTOMER', 'RETURNED_TO_SELLER', 'UNDELIVERED'
];

const statusCallbackSchema = z.object({
  sfx_order_id: z.number().or(z.string()).transform(val => BigInt(val)),
  client_order_id: z.string(),
  status: z.enum(validStatuses),
}).strip();

const locationCallbackSchema = z.object({
  sfx_order_id: z.number().or(z.string()).transform(val => BigInt(val)),
  client_order_id: z.string(),
  rider_latitude: z.number().min(-90).max(90),
  rider_longitude: z.number().min(-180).max(180),
  pickup_eta: z.number().optional(),
  drop_eta: z.number().optional(),
}).strip();

function validateStatusCallback(payload) {
  return statusCallbackSchema.parse(payload);
}

function validateLocationCallback(payload) {
  return locationCallbackSchema.parse(payload);
}

module.exports = {
  validateStatusCallback,
  validateLocationCallback
};
