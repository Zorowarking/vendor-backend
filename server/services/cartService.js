const { prisma, withRetry } = require('../lib/prisma');

/**
 * Cart Service for handling business logic related to shopping carts.
 */
class CartService {
  /**
   * Config for add-on charges (normally fetched from an admin config table)
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

    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours expiry
        let queryWhere = customerId ? { customerId } : { guestId };

        let cart = await prisma.cart.findFirst({
          where: queryWhere,
          include: { items: true }
        });

        if (cart) {
          cart = await prisma.cart.update({
            where: { id: cart.id },
            data: { expiresAt },
            include: { items: true }
          });
        } else {
          // Attempt to adopt guest cart if upgrading, otherwise create new
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
                guestId: customerId ? null : guestId, // Avoid unique constraint
                vendorId,
                expiresAt
              },
              include: { items: true }
            });
          }
        }

        console.log('[CART-SERVICE] Cart context established. ID:', cart.id);

        // 2. Validate Single Vendor Rule
        if (cart.vendorId && cart.vendorId !== vendorId && cart.items.length > 0) {
          console.warn('[CART-SERVICE] Cross-vendor block triggered');
          throw { status: 409, message: 'Cross-vendor add blocked. Clear cart or checkout first.' };
        }

        // 3. Update vendorId if cart was empty
        if (cart.items.length === 0 && cart.vendorId !== vendorId) {
          console.log('[CART-SERVICE] Updating empty cart vendor to:', vendorId);
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
          console.log('[CART-SERVICE] Updating existing item:', existingItem.id);
          return await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: quantity || existingItem.quantity,
              options: options || existingItem.options,
              ageVerifiedCheckbox: ageVerified
            }
          });
        } else {
          console.log('[CART-SERVICE] Creating new cart item for product:', productId);
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
        console.error('[CART-SERVICE] Update error:', err);
        throw err;
    }
  }

  /**
   * Calculate cart totals with add-on charge logic
   */
  static async getCart(identifier) {
    const { customerId, guestId } = identifier;
    console.log('[CART-SERVICE] Fetching cart for:', identifier);
    
    try {
        let cart = await prisma.cart.findFirst({
          where: customerId ? { customerId } : { guestId },
          include: { items: true }
        });

        // AUTO-ADOPTION: If no customer cart exists but there's a guest cart, migrate it
        if (!cart && customerId && guestId) {
          console.log('[CART-SERVICE] No customer cart, checking for guest cart migration:', guestId);
          cart = await prisma.cart.findFirst({
            where: { guestId },
            include: { items: true }
          });

          if (cart) {
            console.log('[CART-SERVICE] Migrating guest cart to customer account:', cart.id);
            cart = await prisma.cart.update({
              where: { id: cart.id },
              data: { customerId, guestId: null },
              include: { items: true }
            });
          }
        }

        if (!cart) {
            console.log('[CART-SERVICE] No cart found for provided identifiers');
            return null;
        }

        // Fetch vendor details separately to get the Company/Restaurant Name
        const vendor = cart.vendorId ? await prisma.vendor.findUnique({
          where: { id: cart.vendorId }
        }) : null;

        console.log('[CART-SERVICE] Cart found, fetching products for IDs:', cart.items.map(i => i.productId));
        const productIds = cart.items.map(item => item.productId);
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          include: { addOns: true }
        });

        console.log('[CART-SERVICE] Products fetched:', products.length);
        const productMap = products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

        let subtotal = 0;
        let totalAddonCharges = 0;

        const items = cart.items.map(item => {
          const product = productMap[item.productId];
          
          if (!product) {
            return { ...item, name: 'Unknown Product', basePrice: 0, total: 0 };
          }

          const basePrice = product.basePrice ? Number(product.basePrice) : 0;
          const itemSubtotal = basePrice * item.quantity;
          
          let itemAddonCharge = 0;
          const selectedAddons = item.options?.selectedAddons || [];
          
          if (selectedAddons.length > this.CONFIG.FREE_ADDON_LIMIT) {
            const chargeableUnits = selectedAddons.length - this.CONFIG.FREE_ADDON_LIMIT;
            itemAddonCharge = chargeableUnits * this.CONFIG.PER_UNIT_CHARGE;
          }

          const subtotalItem = Number(itemSubtotal);
          const addonChargeItem = Number(itemAddonCharge);

          // LATEST FIX: ACCUMULATE TOTALS
          subtotal += subtotalItem;
          totalAddonCharges += addonChargeItem;

          return {
            ...item,
            name: product.name || 'Product',
            price: basePrice,           // Unit price before addons
            unitPrice: basePrice + (addonChargeItem / item.quantity), // Computed unit price
            addonCharge: addonChargeItem,
            total: subtotalItem + addonChargeItem
          };
        });

        console.log('[CART-SERVICE] Calculation complete. Subtotal:', subtotal, 'Addons:', totalAddonCharges);

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
        console.error('[CART-SERVICE] CRITICAL ERROR during calculation:', err.message);
        console.error(err.stack);
        throw err;
    }
  }
}

module.exports = CartService;
