const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const guestSession = require('../middleware/guest');

/**
 * MODULE 2 — VENDOR & PRODUCT BROWSING
 */

// GET /vendors — list all active (online) vendors
router.get('/vendors', guestSession, async (req, res) => {
  try {
    const { category } = req.query;
    
    const where = {
      onlineStatus: 'online', 
      accountStatus: { in: ['APPROVED', 'ACTIVE'] }
    };

    if (category && category !== 'All') {
      where.businessCategory = category;
    }

    const vendors = await prisma.vendor.findMany({
      where,
      select: {
        id: true,
        businessName: true,
        businessCategory: true,
        logoUrl: true,
        bannerUrl: true, // Added for banner display
        businessAddress: true,
        latitude: true,
        longitude: true,
        storeDescription: true,
        onlineStatus: true
      }
    });
    const mappedVendors = vendors.map(v => ({
      ...v,
      name: v.businessName,      // Alias for frontend compatibility 
      description: v.storeDescription, // Alias for frontend compatibility
      logoUrl: v.logoUrl,
      bannerUrl: v.bannerUrl
    }));

    console.log('[DEBUG] Sending mapped vendors count:', mappedVendors.length);
    if (mappedVendors.length > 0) {
        console.log('[DEBUG] First vendor images:', {
            name: mappedVendors[0].name,
            logo: mappedVendors[0].logoUrl,
            banner: mappedVendors[0].bannerUrl
        });
    }
    res.json({ success: true, vendors: mappedVendors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /vendors/:id — vendor details
router.get('/vendors/:id', guestSession, async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id }
    });

    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ success: true, vendor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendor details' });
  }
});

// GET /vendors/:id/products — all products for a vendor, with add-ons and pricing
router.get('/vendors/:id/products', guestSession, async (req, res) => {
  try {
    const { id } = req.params;
    const products = await prisma.product.findMany({
      where: { 
        vendorId: id, 
        isActive: true, 
        reviewStatus: { equals: 'APPROVED', mode: 'insensitive' }
      },
      include: { addOns: true, images: true }
    });
    const mappedProducts = products.map(p => ({
      ...p,
      image: p.images && p.images.length > 0 ? p.images[0].url : null,
      imageUrl: p.images && p.images.length > 0 ? p.images[0].url : null,
      price: Number(p.basePrice), // Alias for frontend
      addons: p.addOns?.map(a => ({ ...a, price: Number(a.price || 0) })) // Alias and numeric price
    }));
    res.json({ success: true, products: mappedProducts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /products/:id — single product detail with add-ons, pricing tiers, and category/type metadata
router.get('/products/:id', guestSession, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { addOns: true, images: true }
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    const mappedProduct = {
      ...product,
      image: product.images && product.images.length > 0 ? `${product.images[0].url}?t=${Date.now()}` : null,
      price: Number(product.basePrice),
      addons: product.addOns?.map(a => ({ ...a, price: Number(a.price || 0) }))
    };
    res.json({ success: true, product: mappedProduct });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
});


module.exports = router;
