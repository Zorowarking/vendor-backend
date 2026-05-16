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
    // Fetch the FCM token for the vendor profile.
    const vendor = await require('./prisma').prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { fcmToken: true }
    });
    
    const fcmToken = vendor?.fcmToken;
    if (!fcmToken || fcmToken === 'MOCK_TOKEN_OR_FETCH_FROM_DB') return;

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
    console.log(`[FCM] Bubble update sent for vendor ${vendorId}. Active: ${isActive}`);
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
      select: { fcmToken: true }
    });
    
    if (vendor?.fcmToken) {
      await sendPushNotification(
        vendor.fcmToken, 
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

module.exports = {
  sendPushNotification,
  updateFloatingBubble,
  sendToVendor,
  sendToCustomer
};
