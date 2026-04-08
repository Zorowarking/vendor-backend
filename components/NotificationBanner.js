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
import Colors from '../constants/Colors';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = 90;

export default function NotificationBanner({ notification, onDismiss, onPress }) {
  const slideAnim = useRef(new Animated.Value(-BANNER_HEIGHT - 50)).current;
  const progressAnim = useRef(new Animated.Value(width - 40)).current;

  useEffect(() => {
    if (notification) {
      // Reset values
      slideAnim.setValue(-BANNER_HEIGHT - 50);
      progressAnim.setValue(width - 40);

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
        duration: 5000,
        useNativeDriver: false
      }).start();

      // Auto Dismiss
      const timer = setTimeout(() => {
        dismiss();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -BANNER_HEIGHT - 50,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!notification) return null;

  const { title, body } = notification.notification || {};
  const { type } = notification.data || {};

  const getIconName = () => {
    switch (type) {
      case 'new_order': return 'cart';
      case 'pickup_request': return 'bicycle';
      case 'kyc_approved': return 'checkmark-circle';
      case 'kyc_rejected': return 'alert-circle';
      default: return 'notifications';
    }
  };

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
            <Text style={styles.title} numberOfLines={1}>{title || 'New Notification'}</Text>
            <Text style={styles.body} numberOfLines={2}>{body || 'You have a new update.'}</Text>
          </View>
          <TouchableOpacity onPress={dismiss}>
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
    zIndex: 9999,
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  banner: {
    width: '100%',
    backgroundColor: 'rgba(30, 30, 30, 0.95)', // Sleek dark glassmorphism
    borderRadius: 16,
    padding: 15,
    paddingBottom: 18,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    color: Colors.white + 'BF', // 75% white
    lineHeight: 18,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: Colors.primary,
    opacity: 0.8,
  }
});
