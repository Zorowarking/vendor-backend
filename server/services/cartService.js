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
        let queryWhere = customerId ? { customerId, vendorId } : { guestId, vendorId };

        // 1. Enforce Vendor Limits
        const activeCarts = await prisma.cart.findMany({
          where: customerId ? { customerId } : { guestId },
          include: { items: { take: 1 } }
        });
        
        const nonEmptyCarts = activeCarts.filter(c => c.items.length > 0);
        const alreadyHasThisVendor = nonEmptyCarts.some(c => c.vendorId === vendorId);
        
        if (!alreadyHasThisVendor) {
          if (!customerId && nonEmptyCarts.length >= 1) {
            // Guest User: 1-vendor limit
            throw { status: 409, message: 'Guests can only order from one vendor at a time. Please login to shop from multiple restaurants!' };
          }
          if (customerId && nonEmptyCarts.length >= 3) {
            // Logged-in User: 3-vendor limit
            throw { status: 403, message: 'You can only have items from up to 3 different vendors in your cart.' };
          }
        }

        const start = Date.now();
        let cart = await prisma.cart.findUnique({
          where: customerId ? { 
            customerId_vendorId: { customerId, vendorId } 
          } : { 
            guestId_vendorId: { guestId: guestId, vendorId } 
          },
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
          // No cart for THIS vendor yet. Create one.
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
  static async getCart(identifier, requestedVendorId = null) {
    const { customerId, guestId } = identifier;
    
    try {
        const queryWhere = customerId ? { customerId } : { guestId };
        
        // 1. Fetch carts
        const cartQuery = {
          where: requestedVendorId ? { ...queryWhere, vendorId: requestedVendorId } : queryWhere,
          include: { items: true }
        };

        if (requestedVendorId) {
          // SINGLE VENDOR MODE (Legacy support for checkout)
          const cart = await prisma.cart.findUnique({
            where: customerId ? { 
              customerId_vendorId: { customerId, vendorId: requestedVendorId } 
            } : { 
              guestId_vendorId: { guestId: guestId, vendorId: requestedVendorId } 
            },
            include: { items: true }
          });
          
          if (!cart) return null;
          
          // Enrich this single cart (reuse existing logic but for one)
          return await this._enrichCarts([cart], true);
        }

        // MULTI VENDOR MODE (For cart screen)
        const allCarts = await prisma.cart.findMany({
          where: queryWhere,
          include: { items: true }
        });

        if (allCarts.length === 0) return { carts: [], totalItems: 0, grandTotal: 0 };
        return await this._enrichCarts(allCarts, false);

    } catch (err) {
        console.error('[CART-SERVICE] Error in getCart:', err);
        throw err;
    }
  }

  /**
   * Internal helper to enrich cart items with product and vendor details
   */
  static async _enrichCarts(allCarts, singleMode = false) {
    const vendorIds = [...new Set(allCarts.map(c => c.vendorId))];
    const vendors = await prisma.vendor.findMany({ where: { id: { in: vendorIds } } });
    const vendorMap = vendors.reduce((acc, v) => ({ ...acc, [v.id]: v }), {});

    const allProductIds = [...new Set(allCarts.flatMap(c => c.items.map(i => i.productId)))];
    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      include: { 
        addOns: true,
        customizationGroups: { include: { options: true } }
      }
    });
    const productMap = products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

    const enrichedCarts = allCarts.map(cart => {
      let subtotal = 0;
      let totalAddonCharges = 0;
      
      const items = cart.items.map(item => {
        const product = productMap[item.productId];
        if (!product) return { ...item, name: 'Unknown Product', basePrice: 0, total: 0 };

        const basePrice = Number(product.basePrice || 0);
        const itemSubtotal = basePrice * item.quantity;
        
        let itemAddonCharge = 0;
        const selectedAddons = item.options?.selectedAddons || [];
        selectedAddons.forEach(selected => {
          const addonName = typeof selected === 'string' ? selected : (selected.name || '');
          const addonDetails = product.addOns.find(a => a.name === addonName || a.id === selected.id);
          if (addonDetails) {
            const qty = selected.quantity || 1;
            const freeLimit = addonDetails.freeLimit || 0;
            itemAddonCharge += (Math.max(0, qty - freeLimit) * Number(addonDetails.price || 0));
          }
        });

        const selectedCustomizations = item.options?.customizations || [];
        selectedCustomizations.forEach(groupSelection => {
          const groupDetails = product.customizationGroups.find(g => g.id === groupSelection.groupId);
          if (groupDetails && groupSelection.selectedOptions) {
            groupSelection.selectedOptions.forEach(selectedOpt => {
              const optId = typeof selectedOpt === 'string' ? selectedOpt : selectedOpt.id;
              const optDetails = groupDetails.options.find(o => o.id === optId);
              if (optDetails) {
                const optQty = typeof selectedOpt === 'object' ? (selectedOpt.quantity || 1) : 1;
                itemAddonCharge += (Number(optDetails.priceModifier || 0) * Math.max(0, optQty - (optDetails.freeLimit || 0)));
              }
            });
          }
        });

        const totalLineAddonCharge = itemAddonCharge * item.quantity;
        subtotal += itemSubtotal;
        totalAddonCharges += totalLineAddonCharge;

        return {
          ...item,
          name: product.name,
          price: basePrice,
          unitPrice: basePrice + itemAddonCharge,
          total: itemSubtotal + totalLineAddonCharge
        };
      }).filter(i => i.name !== 'Unknown Product');

      return {
        id: cart.id,
        vendorId: cart.vendorId,
        vendorName: vendorMap[cart.vendorId]?.businessName || 'Unknown Vendor',
        items,
        subtotal,
        totalAddonCharges,
        total: subtotal + totalAddonCharges
      };
    }).filter(c => c.items.length > 0);

    if (singleMode) return enrichedCarts[0] || null;

    return {
      carts: enrichedCarts,
      totalItems: enrichedCarts.reduce((acc, c) => acc + c.items.length, 0),
      grandTotal: enrichedCarts.reduce((acc, c) => acc + c.total, 0)
    };
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

  static async removeItem(identifier, itemId) {
    const { customerId, guestId } = identifier;
    
    const cart = await prisma.cart.findFirst({
        where: customerId ? { customerId } : { guestId }
    });

    if (!cart) return; // Cart doesn't exist, nothing to remove

    await prisma.cartItem.deleteMany({
      where: { 
        id: itemId,
        cartId: cart.id // Security: Ensure item belongs to THIS cart
      }
    });
  }
}

module.exports = CartService;
