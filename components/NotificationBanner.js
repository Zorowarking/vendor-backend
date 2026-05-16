import React, { useEffect, useRef } from 'react';
import { 
  Animated, 
  View, 
  Text, 
  StyleSheet, 
  Dimensions, 
  TouchableOpacity, 
  Platform,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '../constants/Colors';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = 100;

export default function NotificationBanner({ notification, onDismiss, onPress }) {
  const slideAnim = useRef(new Animated.Value(-BANNER_HEIGHT - 100)).current;
  const progressAnim = useRef(new Animated.Value(width - 30)).current;

  useEffect(() => {
    if (notification) {
      // Trigger Haptic Feedback for the premium feel
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Reset values
      slideAnim.setValue(-BANNER_HEIGHT - 100);
      progressAnim.setValue(width - 30);

      // Slide In
      Animated.spring(slideAnim, {
        toValue: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 60,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();

      // Progress Bar Animation
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 6000, // 6 seconds for better readability
        useNativeDriver: false
      }).start();

      // Auto Dismiss
      const timer = setTimeout(() => {
        dismiss();
      }, 6000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -BANNER_HEIGHT - 100,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!notification) return null;

  const { title, body } = notification.notification || {};
  const { type, senderName, timestamp } = notification.data || {};

  const getIconName = () => {
    switch (type) {
      case 'new_order': return 'cart';
      case 'pickup_request': return 'bicycle';
      case 'kyc_approved': return 'checkmark-circle';
      case 'kyc_rejected': return 'alert-circle';
      case 'support_update': return 'chatbubble-ellipses';
      default: return 'notifications';
    }
  };

  const formattedTime = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity 
        style={styles.banner} 
        activeOpacity={0.9}
        onPress={() => {
          if (onPress) onPress(notification);
          dismiss();
        }}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name={getIconName()} size={24} color={Colors.white} />
          </View>
          <View style={styles.textContainer}>
            <View style={styles.headerRow}>
              <Text style={styles.sender} numberOfLines={1}>{senderName || 'System'}</Text>
              <Text style={styles.time}>{formattedTime}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{title || 'New Update'}</Text>
            <Text style={styles.body} numberOfLines={2}>{body || 'Tap to view details.'}</Text>
          </View>
          <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.white + '80'} />
          </TouchableOpacity>
        </View>

        {/* Progress Timer Bar */}
        <Animated.View style={[styles.progressBar, { width: progressAnim }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  banner: {
    width: '100%',
    backgroundColor: '#1A1A1A', // Deep charcoal
    borderRadius: 16,
    padding: 15,
    paddingBottom: 18,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sender: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  time: {
    fontSize: 10,
    color: Colors.white + '60',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 1,
  },
  body: {
    fontSize: 12,
    color: Colors.white + 'A0', // 60% white
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: Colors.primary,
    opacity: 0.6,
  }
});
