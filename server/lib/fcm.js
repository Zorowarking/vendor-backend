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
    // In a real app, you'd fetch the FCM token for the vendor profile.
    // Assuming you have it linked in profile or a separate devices table:
    // const fcmToken = await getVendorFcmToken(vendorId);
    const fcmToken = 'MOCK_TOKEN_OR_FETCH_FROM_DB'; // Placeholder

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
  console.log(`[FCM] Mock notification to Vendor ${vendorId}:`, payload.title);
  // Real implementation: lookup vendor FCM token and call sendPushNotification
};

/**
 * Convenience helper to send to a Customer
 */
const sendToCustomer = async (firebaseUid, payload) => {
  console.log(`[FCM] Mock notification to Customer UID ${firebaseUid.substring(0,8)}...:`, payload.title);
  // Real implementation: lookup customer FCM token and call sendPushNotification
};

module.exports = {
  sendPushNotification,
  updateFloatingBubble,
  sendToVendor,
  sendToCustomer
};
