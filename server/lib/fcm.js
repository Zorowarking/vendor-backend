const admin = require('firebase-admin');

/**
 * Sends a standard push notification via FCM
 */
const sendPushNotification = async (fcmToken, title, body, dataPayload = {}) => {
  if (!admin.apps.length || !fcmToken) return;

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: 'high'
      }
    });
    console.log(`[FCM] Notification sent to ${fcmToken.substring(0, 10)}...`);
  } catch (error) {
    console.error(`[FCM] Error sending message:`, error.message);
  }
};

/**
 * Module B3 - Floating Bubble Logic
 * Sends a silent data payload to update the Android floating bubble state
 */
const updateFloatingBubble = async (vendorId, isActive, activeOrderCount = 0) => {
  if (!admin.apps.length) return;

  try {
    // Fetch the FCM token via the vendor's profile
    const vendor = await require('./prisma').prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { profile: { select: { fcmToken: true } } }
    });
    
    const fcmToken = vendor?.profile?.fcmToken || vendor?.fcmToken;
    if (!fcmToken || fcmToken.startsWith('mock_')) return;

    await admin.messaging().send({
      token: fcmToken,
      data: {
        type: 'BUBBLE_UPDATE',
        bubble_active: isActive.toString(),
        badge_count: activeOrderCount.toString()
      },
      android: {
        priority: 'high'
      }
    });
    console.log(`[FCM] Bubble update sent for vendor ${vendorId}.`);
  } catch (error) {
    console.error(`[FCM] Bubble update error:`, error.message);
  }
};

/**
 * Convenience helper to send to a Vendor
 */
const sendToVendor = async (vendorId, payload) => {
  if (!admin.apps.length) return;

  try {
    const vendor = await require('./prisma').prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { profile: { select: { fcmToken: true } } }
    });
    
    const fcmToken = vendor?.profile?.fcmToken || vendor?.fcmToken;
    if (fcmToken) {
      await sendPushNotification(
        fcmToken, 
        payload.title, 
        payload.body, 
        { ...payload, type: payload.type || 'new_order' }
      );
    }
  } catch (error) {
    console.error(`[FCM] Error sending to vendor ${vendorId}:`, error.message);
  }
};

/**
 * Convenience helper to send to a Customer
 */
const sendToCustomer = async (firebaseUid, payload) => {
  if (!admin.apps.length) return;

  try {
    const profile = await require('./prisma').prisma.profile.findUnique({
      where: { firebaseUid },
      select: { fcmToken: true }
    });
    
    if (profile?.fcmToken) {
      await sendPushNotification(
        profile.fcmToken, 
        payload.title, 
        payload.body, 
        { ...payload, type: payload.type || 'order_update' }
      );
    }
  } catch (error) {
    console.error(`[FCM] Error sending to customer ${firebaseUid}:`, error.message);
  }
};

/**
 * Broadcast notification to a group of users
 * @param {string} targetAudience - 'VENDORS', 'CUSTOMERS', or 'ALL'
 * @param {object} payload - { title, body, data }
 */
const broadcastToUsers = async (targetAudience, payload) => {
  if (!admin.apps.length) return;

  try {
    let tokens = [];
    const prisma = require('./prisma').prisma;

    if (targetAudience === 'VENDORS' || targetAudience === 'ALL') {
      const vendors = await prisma.profile.findMany({
        where: { fcmToken: { not: null }, role: 'VENDOR' },
        select: { fcmToken: true }
      });
      tokens = tokens.concat(vendors.map(v => v.fcmToken));
    }

    if (targetAudience === 'CUSTOMERS' || targetAudience === 'ALL') {
      const customers = await prisma.profile.findMany({
        where: { fcmToken: { not: null }, role: 'CUSTOMER' },
        select: { fcmToken: true }
      });
      tokens = tokens.concat(customers.map(c => c.fcmToken));
    }

    // Filter out mock tokens or nulls
    tokens = [...new Set(tokens.filter(t => t && t.length > 20 && !t.startsWith('mock_')))];

    if (tokens.length === 0) {
      console.log(`[FCM] No valid tokens found for broadcast to ${targetAudience}`);
      return { success: 0, failure: 0 };
    }

    // Firebase multicast allows up to 500 tokens per batch
    const BATCH_SIZE = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batchTokens = tokens.slice(i, i + BATCH_SIZE);
      const message = {
        tokens: batchTokens,
        notification: { title: payload.title, body: payload.body },
        data: { ...payload.data, type: payload.type || 'admin_broadcast' },
        android: { priority: 'high' }
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      successCount += response.successCount;
      failureCount += response.failureCount;
    }

    console.log(`[FCM] Broadcast to ${targetAudience}: ${successCount} successes, ${failureCount} failures.`);
    return { success: successCount, failure: failureCount };
  } catch (error) {
    console.error(`[FCM] Broadcast error:`, error.message);
    throw error;
  }
};

module.exports = {
  sendPushNotification,
  updateFloatingBubble,
  sendToVendor,
  sendToCustomer,
  broadcastToUsers
};
