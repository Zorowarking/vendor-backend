const { prisma, withRetry } = require('../lib/prisma');

/**
 * Cart Service for handling business logic related to shopping carts.
 */
class CartService {
  /**
   * Config for add-on charges
   */
  static CONFIG = {
    FREE_ADDON_LIMIT: 3,
    PER_UNIT_CHARGE: 2.50
  };

  /**
   * Add or update an item in the cart
   */
  static async updateCart(identifier, { productId, vendorId, quantity, options, isRestricted }) {
    const { customerId, guestId } = identifier;
    console.log('[CART-SERVICE] Updating cart for:', identifier, { productId, vendorId });

    // Validation: Ensure IDs are valid UUIDs if they exist
    const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    if (productId && !isUuid(productId)) {
        throw { status: 400, message: `Invalid productId format: ${productId}` };
    }
    if (vendorId && !isUuid(vendorId)) {
        throw { status: 400, message: `Invalid vendorId format: ${vendorId}` };
    }

    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours expiry
        let queryWhere = customerId ? { customerId } : { guestId };

        const start = Date.now();
        let cart = await prisma.cart.findFirst({
          where: queryWhere,
          include: { items: true }
        });
        console.log(`[CART-SERVICE] Lookup took ${Date.now() - start}ms`);

        if (cart) {
          cart = await prisma.cart.update({
            where: { id: cart.id },
            data: { expiresAt },
            include: { items: true }
          });
        } else {
          // Attempt to adopt guest cart if upgrading
          if (customerId && guestId) {
            cart = await prisma.cart.findFirst({
              where: { guestId },
              include: { items: true }
            });
          }

          if (cart) {
            cart = await prisma.cart.update({
              where: { id: cart.id },
              data: { customerId, guestId: null, expiresAt },
              include: { items: true }
            });
          } else {
            cart = await prisma.cart.create({
              data: {
                customerId,
                guestId: customerId ? null : guestId,
                vendorId,
                expiresAt
              },
              include: { items: true }
            });
          }
        }

        // 2. Validate Single Vendor Rule
        if (cart.vendorId && cart.vendorId !== vendorId && cart.items.length > 0) {
          throw { status: 409, message: 'Cross-vendor add blocked. Clear cart or checkout first.' };
        }

        // 3. Update vendorId if cart was empty
        if (cart.items.length === 0 && cart.vendorId !== vendorId) {
          await prisma.cart.update({
            where: { id: cart.id },
            data: { vendorId }
          });
        }

        // 4. Handle Age Verification
        const ageVerified = isRestricted ? !!options?.ageVerified : true;

        // 5. Upsert Cart Item
        const existingItem = cart.items.find(item => item.productId === productId);
        if (existingItem) {
          return await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: quantity || existingItem.quantity,
              options: options || existingItem.options,
              ageVerifiedCheckbox: ageVerified
            }
          });
        } else {
          return await prisma.cartItem.create({
            data: {
              cartId: cart.id,
              productId,
              quantity: quantity || 1,
              options,
              ageVerifiedCheckbox: ageVerified
            }
          });
        }
    } catch (err) {
        console.error('[CART-SERVICE] Critical Update Error:', err);
        console.error('[CART-SERVICE] Payload:', { identifier, productId, vendorId, quantity, options });
        throw err;
    }
  }

  /**
   * Calculate cart totals with add-on charge logic
   */
  static async getCart(identifier) {
    const { customerId, guestId } = identifier;
    
    try {
        let cart = await prisma.cart.findFirst({
          where: customerId ? { customerId } : { guestId },
          include: { items: true }
        });

        if (!cart && customerId && guestId) {
          cart = await prisma.cart.findFirst({
            where: { guestId },
            include: { items: true }
          });

          if (cart) {
            cart = await prisma.cart.update({
              where: { id: cart.id },
              data: { customerId, guestId: null },
              include: { items: true }
            });
          }
        }

        if (!cart) return null;

        const vendor = cart.vendorId ? await prisma.vendor.findUnique({
          where: { id: cart.vendorId }
        }) : null;

        const productIds = cart.items.map(item => item.productId);
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          include: { addOns: true }
        });

        const productMap = products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

        let subtotal = 0;
        let totalAddonCharges = 0;

        const items = cart.items.map(item => {
          const product = productMap[item.productId];
          if (!product) return { ...item, name: 'Unknown Product', basePrice: 0, total: 0 };

          const basePrice = Number(product.basePrice || 0);
          const itemSubtotal = basePrice * item.quantity;
          
          let itemAddonCharge = 0;
          const selectedAddons = item.options?.selectedAddons || [];
          
          // Calculate charges per-addon based on their specific freeLimit
          selectedAddons.forEach(selected => {
            // Find the add-on details from the product's add-on list
            // We match by name or ID (fallback to name for compatibility)
            const addonName = typeof selected === 'string' ? selected : (selected.name || '');
            const addonDetails = product.addOns.find(a => a.name === addonName || a.id === selected.id);
            
            if (addonDetails) {
              const qty = selected.quantity || 1;
              const freeLimit = addonDetails.freeLimit || 0;
              const price = Number(addonDetails.price || 0);
              
              const chargeableQty = Math.max(0, qty - freeLimit);
              itemAddonCharge += (chargeableQty * price);
            }
          });

          subtotal += itemSubtotal;
          totalAddonCharges += itemAddonCharge;

          return {
            ...item,
            ageVerified: item.ageVerifiedCheckbox,
            name: product.name || 'Product',
            price: basePrice,
            unitPrice: basePrice + (itemAddonCharge / item.quantity),
            addonCharge: itemAddonCharge,
            total: itemSubtotal + itemAddonCharge
          };
        });

        return {
          id: cart.id,
          vendorId: cart.vendorId,
          vendorName: vendor?.businessName,
          items,
          subtotal,
          totalAddonCharges,
          total: subtotal + totalAddonCharges
        };
    } catch (err) {
        console.error('[CART-SERVICE] Error in getCart:', err);
        throw err;
    }
  }

  static async clearCart(identifier) {
    const { customerId, guestId } = identifier;
    const cart = await prisma.cart.findFirst({
        where: customerId ? { customerId } : { guestId }
    });
    if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
  }
}

module.exports = CartService;
